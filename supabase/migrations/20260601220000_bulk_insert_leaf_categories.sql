-- 20260601220000_bulk_insert_leaf_categories.sql
-- Update bulk_insert_transactions to only accept leaf categories
-- (categories that have no children in category_hierarchy).

CREATE OR REPLACE FUNCTION public.bulk_insert_transactions(p_transactions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id        uuid;
  v_tx             jsonb;
  v_category_id    uuid;
  v_bank_account_id uuid;
  v_tx_id          uuid;
  v_inserted_count integer := 0;
  v_errors         jsonb   := '[]'::jsonb;
  v_idx            integer := 0;
  v_type           public.transaction_type;
  v_tag            text;
  v_tag_exists     boolean;
BEGIN
  -- Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Ensure input is an array
  IF p_transactions IS NULL OR jsonb_typeof(p_transactions) <> 'array' THEN
    RAISE EXCEPTION 'p_transactions must be a JSON array' USING ERRCODE = '22023';
  END IF;

  -- Iterate through each element
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_idx := v_idx + 1;

    BEGIN
      -- Required fields
      DECLARE
        v_missing_fields text[] := ARRAY[]::text[];
        v_error_msg      text;
      BEGIN
        IF v_tx->>'date' IS NULL THEN
          v_missing_fields := array_append(v_missing_fields, 'date');
        END IF;
        IF v_tx->>'type' IS NULL THEN
          v_missing_fields := array_append(v_missing_fields, 'type');
        END IF;
        IF v_tx->>'amount' IS NULL THEN
          v_missing_fields := array_append(v_missing_fields, 'amount');
        END IF;
        IF array_length(v_missing_fields, 1) IS NOT NULL THEN
          IF array_length(v_missing_fields, 1) = 1 THEN
            v_error_msg := format('Missing required field: %s', v_missing_fields[1]);
          ELSE
            v_error_msg := format('Missing required fields: %s', array_to_string(v_missing_fields, ', '));
          END IF;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx,
            'error', v_error_msg
          );
          CONTINUE;
        END IF;
      END;

      -- Type validation (casts to enum)
      BEGIN
        v_type := (v_tx->>'type')::public.transaction_type;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object(
          'index', v_idx,
          'error', format('Invalid transaction type: "%s"', v_tx->>'type')
        );
        CONTINUE;
      END;

      -- Resolve category name -> id (leaf categories only)
      v_category_id := NULL;
      IF v_tx->>'category' IS NOT NULL THEN
        SELECT c.id INTO v_category_id
        FROM public.categories c
        LEFT JOIN public.category_hierarchy ch
          ON ch.ancestor_id = c.id AND ch.depth = 1
        WHERE c.user_id = v_user_id
          AND c.type    = v_type
          AND c.name    = v_tx->>'category'
        GROUP BY c.id
        HAVING COUNT(ch.descendant_id) = 0
        LIMIT 1;

        IF v_category_id IS NULL THEN
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx,
            'error', format('Category "%s" not found as leaf for type "%s"', v_tx->>'category', v_type)
          );
          CONTINUE;
        END IF;
      END IF;

      -- Resolve bank account name -> id if provided
      v_bank_account_id := NULL;
      IF v_tx->>'bank_account' IS NOT NULL THEN
        SELECT id INTO v_bank_account_id
        FROM public.bank_accounts
        WHERE user_id = v_user_id
          AND name = v_tx->>'bank_account'
        LIMIT 1;

        IF v_bank_account_id IS NULL THEN
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx,
            'error', format('Bank account "%s" not found', v_tx->>'bank_account')
          );
          CONTINUE;
        END IF;
      END IF;

      -- Validate tags exist (if provided)
      IF v_tx->'tags' IS NOT NULL THEN
        FOR v_tag IN SELECT jsonb_array_elements_text(v_tx->'tags')
        LOOP
          SELECT EXISTS(
            SELECT 1 FROM public.tags WHERE user_id = v_user_id AND name = v_tag
          ) INTO v_tag_exists;

          IF NOT v_tag_exists THEN
            v_errors := v_errors || jsonb_build_object(
              'index', v_idx,
              'error', format('Tag "%s" not found', v_tag)
            );
            EXIT;
          END IF;
        END LOOP;

        IF jsonb_array_length(v_errors) > 0 AND (v_errors->-1->>'index')::integer = v_idx THEN
          CONTINUE;
        END IF;
      END IF;

      -- Insert transaction
      INSERT INTO public.transactions (
        user_id,
        date,
        type,
        category_id,
        bank_account_id,
        amount,
        tags,
        notes
      ) VALUES (
        v_user_id,
        (v_tx->>'date')::date,
        v_type,
        v_category_id,
        v_bank_account_id,
        (v_tx->>'amount')::numeric,
        CASE WHEN v_tx->'tags' IS NOT NULL
          THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(v_tx->'tags'))
          ELSE NULL END,
        v_tx->>'notes'
      )
      RETURNING id INTO v_tx_id;

      v_inserted_count := v_inserted_count + 1;

      -- Insert tag associations into transaction_tags
      IF v_tx->'tags' IS NOT NULL THEN
        INSERT INTO public.transaction_tags (transaction_id, tag_id)
        SELECT DISTINCT
          v_tx_id,
          tg.id
        FROM jsonb_array_elements_text(v_tx->'tags') AS jt(tag_name)
        JOIN public.tags tg ON tg.user_id = v_user_id AND tg.name = jt.tag_name
        ON CONFLICT (transaction_id, tag_id) DO NOTHING;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'index', v_idx,
        'error', SQLERRM,
        'sqlstate', SQLSTATE
      );
    END;

  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'Bulk insert failed with % error(s)', jsonb_array_length(v_errors)
      USING DETAIL = v_errors::text;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count,
    'total_count', v_idx
  );
END;
$$;

COMMENT ON FUNCTION public.bulk_insert_transactions IS
  'Atomically insert multiple transactions from JSON. Validates foreign keys, rolls back on any error. Only leaf categories (no children) are accepted.';

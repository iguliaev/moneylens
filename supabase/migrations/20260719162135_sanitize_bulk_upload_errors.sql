-- Stop leaking raw Postgres error text (SQLERRM) to bulk-upload clients.
-- Replace it with a SQLSTATE-classified friendly message; the original
-- SQLSTATE is preserved via ERRCODE so it's still available for support/
-- debugging through PostgREST's error code field, without exposing
-- internals like constraint names.

-- bulk_insert_transactions: per-row errors, classify SQLERRM by SQLSTATE
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
        'error', CASE SQLSTATE
          WHEN '23505' THEN 'Duplicate entry'
          WHEN '23503' THEN 'Referenced record not found'
          WHEN '23514' THEN 'Value violates a constraint'
          ELSE 'Row could not be inserted'
        END,
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

-- insert_categories: drop raw SQLERRM from the catch-all, keep SQLSTATE via ERRCODE
CREATE OR REPLACE FUNCTION insert_categories (p_user_id UUID, p_categories jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_inserted_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_categories: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_categories: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  IF p_categories IS NULL OR jsonb_array_length(p_categories) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_categories) AS elem
  WHERE (elem->>'name') IS NULL OR (elem->>'type') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_categories: one or more items are missing required fields "name" or "type"';
  END IF;

  WITH types AS (
    SELECT DISTINCT (elem->>'type') AS typ
    FROM jsonb_array_elements(p_categories) AS elem
  ), invalid AS (
    SELECT typ
    FROM types
    WHERE typ NOT IN (
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = 'public.transaction_type'::regtype
    )
  )
  SELECT typ INTO v_invalid_type FROM invalid LIMIT 1;

  IF v_invalid_type IS NOT NULL THEN
    RAISE EXCEPTION 'insert_categories: invalid transaction_type: %', v_invalid_type;
  END IF;

  INSERT INTO public.categories (user_id, type, name, description)
  SELECT
    p_user_id,
    (elem->>'type')::public.transaction_type,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_categories) AS elem
  ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_categories failed' USING ERRCODE = SQLSTATE;
END;
$$;

-- insert_bank_accounts: drop raw SQLERRM from the catch-all, keep SQLSTATE via ERRCODE
CREATE
OR REPLACE FUNCTION insert_bank_accounts (p_user_id UUID, p_bank_accounts jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_inserted_count int := 0;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_bank_accounts: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_bank_accounts: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_bank_accounts IS NULL OR jsonb_array_length(p_bank_accounts) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required field: name must be present for every element
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_bank_accounts) AS elem
  WHERE (elem->>'name') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_bank_accounts: one or more items are missing required field "name"';
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.bank_accounts (user_id, name, description)
  SELECT
    p_user_id,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_bank_accounts) AS elem
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_bank_accounts failed' USING ERRCODE = SQLSTATE;
END;
$$;

-- insert_tags: drop raw SQLERRM from the catch-all, keep SQLSTATE via ERRCODE
CREATE
OR REPLACE FUNCTION insert_tags (p_user_id UUID, p_tags jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_inserted_count int := 0;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_tags: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_tags: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_tags IS NULL OR jsonb_array_length(p_tags) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required field: name must be present for every element
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_tags) AS elem
  WHERE (elem->>'name') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_tags: one or more items are missing required field "name"';
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.tags (user_id, name, description)
  SELECT
    p_user_id,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_tags) AS elem
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_tags failed' USING ERRCODE = SQLSTATE;
END;
$$;

-- bulk_upload_data: drop raw SQLERRM from the catch-all, keep SQLSTATE via ERRCODE
CREATE
OR REPLACE FUNCTION public.bulk_upload_data (p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_categories_inserted int := 0;
  v_bank_accounts_inserted int := 0;
  v_tags_inserted int := 0;
  v_transactions_inserted int := 0;
  v_tx_result jsonb;
BEGIN
  -- Authenticate caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'bulk_upload_data: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Categories (if provided)
  IF p_payload ? 'categories' AND p_payload->'categories' IS NOT NULL THEN
    v_categories_inserted := public.insert_categories(v_user_id, p_payload->'categories');
  END IF;

  -- Bank accounts (if provided)
  IF p_payload ? 'bank_accounts' AND p_payload->'bank_accounts' IS NOT NULL THEN
    v_bank_accounts_inserted := public.insert_bank_accounts(v_user_id, p_payload->'bank_accounts');
  END IF;

  -- Tags (if provided)
  IF p_payload ? 'tags' AND p_payload->'tags' IS NOT NULL THEN
    v_tags_inserted := public.insert_tags(v_user_id, p_payload->'tags');
  END IF;

  -- Transactions (if provided) - delegate to existing bulk_insert_transactions
  IF p_payload ? 'transactions' AND p_payload->'transactions' IS NOT NULL THEN
    -- bulk_insert_transactions is SECURITY DEFINER and will itself authenticate using auth.uid()
    v_tx_result := public.bulk_insert_transactions(p_payload->'transactions');
    -- Extract inserted_count if present
    IF v_tx_result IS NOT NULL AND v_tx_result ? 'inserted_count' THEN
      v_transactions_inserted := (v_tx_result->>'inserted_count')::int;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'categories_inserted', v_categories_inserted,
    'bank_accounts_inserted', v_bank_accounts_inserted,
    'tags_inserted', v_tags_inserted,
    'transactions_inserted', v_transactions_inserted
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    -- validation exceptions raised by helpers - preserve them
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'bulk_upload_data failed' USING ERRCODE = SQLSTATE;
END;
$$;

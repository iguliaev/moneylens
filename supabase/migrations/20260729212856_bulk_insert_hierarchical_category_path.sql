-- Fix leaf-only category lookup ambiguity bug in bulk_insert_transactions.
--
-- Since 20260627124710_fix_category_unique_constraint_include_parent_id.sql,
-- the same leaf category name can exist under multiple parents (e.g.
-- "Food/Other" and "Transport/Other"), so the previous bare-name-only lookup
-- (no parent_id filtering, LIMIT 1) could silently resolve to the wrong
-- category. This migration replaces that lookup with a hierarchical-path
-- rule:
--
--   1. "Parent/Child" (split on the FIRST "/", each side trimmed): resolves
--      the parent as a root category (parent_id IS NULL) and the child as
--      that root's direct child. No leaf check needed — a category with a
--      parent can never itself have children (2-level cap, enforced by
--      trg_validate_category_parent, 20260601210000_add_category_hierarchy.sql).
--   2. Bare name (no "/"): resolves ONLY against root-level (parent_id IS
--      NULL) leaf categories. This is narrower than before (previously
--      matched leaves at any depth) — a category that has since been moved
--      under a parent must now be referenced via "Parent/Child". This is a
--      deliberate breaking-but-correct change: bare names can now only ever
--      match one category per user+type+name (root-leaf uniqueness is
--      already guaranteed by the unique_user_type_name constraint, which is
--      NULLS NOT DISTINCT on parent_id), which removes the ambiguity bug.
--
-- Everything else in bulk_insert_transactions (required-field checks, type
-- validation, bank_account/tags resolution, insert, sanitized-error
-- EXCEPTION handler) is unchanged from 20260719162135_sanitize_bulk_upload_errors.sql.

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

      -- Resolve category name -> id.
      -- "Parent/Child" resolves an exact nested leaf unambiguously; a bare
      -- name resolves only against root-level (parent_id IS NULL) leaves.
      v_category_id := NULL;
      IF v_tx->>'category' IS NOT NULL THEN
        DECLARE
          v_category_raw text := v_tx->>'category';
          v_slash_pos    int;
          v_parent_part  text;
          v_child_part   text;
          v_parent_id    uuid;
        BEGIN
          v_slash_pos := position('/' in v_category_raw);

          IF v_slash_pos > 0 THEN
            v_parent_part := trim(substring(v_category_raw from 1 for v_slash_pos - 1));
            v_child_part  := trim(substring(v_category_raw from v_slash_pos + 1));

            SELECT c.id INTO v_parent_id
            FROM public.categories c
            WHERE c.user_id = v_user_id
              AND c.type    = v_type
              AND c.name    = v_parent_part
              AND c.parent_id IS NULL
            LIMIT 1;

            IF v_parent_id IS NULL THEN
              v_errors := v_errors || jsonb_build_object(
                'index', v_idx,
                'error', format('Category parent "%s" not found for type "%s"', v_parent_part, v_type)
              );
              CONTINUE;
            END IF;

            SELECT c.id INTO v_category_id
            FROM public.categories c
            WHERE c.user_id = v_user_id
              AND c.type    = v_type
              AND c.name    = v_child_part
              AND c.parent_id = v_parent_id
            LIMIT 1;

            IF v_category_id IS NULL THEN
              v_errors := v_errors || jsonb_build_object(
                'index', v_idx,
                'error', format('Category "%s/%s" not found', v_parent_part, v_child_part)
              );
              CONTINUE;
            END IF;
          ELSE
            SELECT c.id INTO v_category_id
            FROM public.categories c
            LEFT JOIN public.category_hierarchy ch
              ON ch.ancestor_id = c.id AND ch.depth = 1
            WHERE c.user_id = v_user_id
              AND c.type    = v_type
              AND c.name    = v_category_raw
              AND c.parent_id IS NULL
            GROUP BY c.id
            HAVING COUNT(ch.descendant_id) = 0
            LIMIT 1;

            IF v_category_id IS NULL THEN
              v_errors := v_errors || jsonb_build_object(
                'index', v_idx,
                'error', format('Category "%s" not found as a root-level category for type "%s"', v_category_raw, v_type)
              );
              CONTINUE;
            END IF;
          END IF;
        END;
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
  'Atomically insert multiple transactions from JSON. Validates foreign keys, rolls back on any error. Category resolution: a "Parent/Child" string resolves an exact nested leaf category unambiguously; a bare name matches only root-level (parent_id IS NULL) leaf categories — categories that have since been moved under a parent must be referenced via "Parent/Child".';

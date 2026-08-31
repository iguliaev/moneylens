-- Drop the legacy denormalized columns on public.transactions:
--   category      TEXT  -- "Obsolete field, do not use" (predates category_id)
--   bank_account  TEXT  -- "Obsolete field, do not use" (predates bank_account_id)
--   tags          TEXT[] -- legacy denormalized array, superseded by transaction_tags
--
-- category / bank_account have had zero live dependents since the totals views
-- were rewritten onto category_id joins (20260627120000, 20260627130740), so
-- they are dropped outright.
--
-- tags (TEXT[]) still had live dependents that are rewired here first, in order,
-- before the column drop:
--   1. enforce_known_tags() + trigger  -- validated NEW.tags; no longer meaningful
--      (bulk_insert_transactions does its own per-tag existence check and the
--      atomic create/update RPCs validate tag ownership).
--   2. sum_transactions_amount(...)    -- unused RPC (no caller in apps/web-next);
--      its p_bank_account / p_tags_any / p_tags_all params filtered on the legacy
--      columns. Dropped rather than rewritten since nothing calls it.
--   3. tags_with_usage view            -- computed in_use_count from UNNEST(tr.tags),
--      which is effectively always 0 in prod because nothing writes the array.
--      Redefined to count via the transaction_tags junction (mirrors
--      delete_tag_safe's counting), making the Tags list usage count correct.
--   4. bulk_insert_transactions(jsonb) -- dual-wrote transactions.tags alongside
--      the transaction_tags rows. The transactions.tags write is removed; the
--      transaction_tags insert and every other check are unchanged.
--   5. transactions_spend / transactions_earn / transactions_save views --
--      per-type views whose SELECT list still exposed COALESCE(t.category, c.name),
--      COALESCE(t.bank_account, b.name) and t.tags. They have no reader anywhere
--      (apps/web-next, e2e, other views/functions) — only stale generated-type
--      entries — so they are dropped rather than rewritten. (Not called out in
--      the plan; discovered via pg_depend during implementation.)
--
-- See docs/superpowers/plans/2026-08-31-drop-legacy-transaction-columns.md.

-- ---------------------------------------------------------------------------
-- 1. Drop the tag-validation trigger + function (operated on transactions.tags)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS enforce_known_tags_trg ON public.transactions;
DROP FUNCTION IF EXISTS public.enforce_known_tags();

-- ---------------------------------------------------------------------------
-- 2. Drop the unused sum_transactions_amount RPC (its GRANT goes with it)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sum_transactions_amount(
  date, date, public.transaction_type, uuid, text, text[], text[]
);

-- ---------------------------------------------------------------------------
-- 3. Drop the per-type transaction views (no readers; exposed the legacy columns)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.transactions_spend;
DROP VIEW IF EXISTS public.transactions_earn;
DROP VIEW IF EXISTS public.transactions_save;

-- ---------------------------------------------------------------------------
-- 4. Redefine tags_with_usage to count usage from the transaction_tags junction
--    instead of UNNEST(transactions.tags). Keeps security_invoker and the
--    deleted_at IS NULL filters on both tags and transactions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.tags_with_usage
WITH (security_invoker = TRUE) AS
SELECT
  g.id,
  g.user_id,
  g.name,
  g.description,
  g.created_at,
  g.updated_at,
  COALESCE(u.cnt, 0)::BIGINT AS in_use_count
FROM public.tags g
LEFT JOIN (
  SELECT
    tt.tag_id,
    COUNT(*)::BIGINT AS cnt
  FROM public.transaction_tags tt
  JOIN public.transactions t
    ON t.id = tt.transaction_id
   AND t.deleted_at IS NULL
  GROUP BY tt.tag_id
) u ON u.tag_id = g.id
WHERE g.deleted_at IS NULL;

COMMENT ON VIEW public.tags_with_usage IS 'Per-user tags with reference counts from non-deleted transactions (in_use_count).';

-- ---------------------------------------------------------------------------
-- 5. Redefine bulk_insert_transactions without the transactions.tags dual-write.
--    Body copied verbatim from
--    20260729212856_bulk_insert_hierarchical_category_path.sql; the only change
--    is removing `tags` from the INSERT column list and its VALUES expression.
-- ---------------------------------------------------------------------------
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
        notes
      ) VALUES (
        v_user_id,
        (v_tx->>'date')::date,
        v_type,
        v_category_id,
        v_bank_account_id,
        (v_tx->>'amount')::numeric,
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

-- ---------------------------------------------------------------------------
-- 6. Drop the now-unreferenced legacy columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions
  DROP COLUMN category,
  DROP COLUMN bank_account,
  DROP COLUMN tags;

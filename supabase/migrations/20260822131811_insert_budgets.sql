-- Add insert_budgets(p_user_id, p_budgets) and wire it into bulk_upload_data,
-- closing the "budgets have no representation in bulk_upload_data or JSON
-- export" gap named in
-- docs/superpowers/plans/2026-08-10-json-export-import-full-restore.md.
--
-- Payload shape (BudgetInput), one array element per budget:
--   {
--     "name": "Groceries budget",              -- required
--     "type": "spend",                          -- required
--     "target_amount": 400,                     -- required, > 0
--     "description": "...",                     -- optional
--     "start_date": "2026-01-01",                -- optional
--     "end_date": "2026-12-31",                  -- optional
--     "categories": ["Food/Eating out", "Fun"],  -- optional
--     "tags": ["essentials"]                     -- optional
--   }
--
-- Category/tag resolution mostly follows the conventions already
-- established elsewhere in this schema, with one deliberate difference:
--   - `categories` entries use the same two-form convention as a
--     transaction's own `category` field (bulk_insert_transactions,
--     20260729212856_bulk_insert_hierarchical_category_path.sql):
--     "Parent/Child" resolves an exact nested leaf unambiguously; a bare
--     name resolves against any root-level (parent_id IS NULL) category —
--     parent or leaf. This is intentionally looser than
--     bulk_insert_transactions (whose bare-name form matches only root-level
--     LEAF categories): a budget, unlike a transaction, can legitimately
--     target a parent category (the budgets UI's category picker offers
--     every category of the type, not just leaves), so restricting bare
--     names to leaves here would make some budgets un-round-trippable
--     through export/import. Both forms require a LIVE (deleted_at IS NULL)
--     category — stricter than bulk_insert_transactions (which doesn't
--     filter deleted_at on category lookups), matching insert_categories'
--     existing "soft-deleted categories are never reused" stance instead of
--     that gap.
--   - `tags` entries are bare names, matched against that user's LIVE tags
--     (deleted_at IS NULL), same as bulk_insert_transactions' tag check but
--     with the deleted_at filter added for the same reason as above.
--
-- Duplicate detection: `(user_id, name)` among non-deleted budgets
-- (uq_budgets_user_name_active, 20260228081322_add_budgets.sql) — ON
-- CONFLICT DO NOTHING, same idempotency contract as
-- categories/bank_accounts/tags. A skipped (already-existing) budget's
-- categories/tags are left untouched, exactly like a skipped category/tag
-- itself is left untouched — this function only ever adds links to a budget
-- it just inserted, never edits an existing one's links.
--
-- Validation is whole-batch (like insert_categories/insert_bank_accounts/
-- insert_tags), not per-row like bulk_insert_transactions: the first
-- resolution failure aborts the entire call. Errors follow the same
-- sanitized-in-production shape as the rest of bulk_upload_data's helpers
-- (docs/api/bulk-upload.md's Error Codes & Messages table) — explicit
-- validation messages are raised as P0001 and pass through verbatim, any
-- other DB error is sanitized to a fixed "insert_budgets failed" message
-- with the original SQLSTATE preserved on ERRCODE.

CREATE OR REPLACE FUNCTION insert_budgets (p_user_id UUID, p_budgets jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_bad_name text;
  v_inserted_count int := 0;
  v_elem jsonb;
  v_type public.transaction_type;
  v_budget_id uuid;
  v_cat_raw text;
  v_cat_id uuid;
  v_tag_name text;
  v_tag_id uuid;
  v_slash_pos int;
  v_parent_part text;
  v_child_part text;
  v_parent_id uuid;
  v_start_date date;
  v_end_date date;
  v_range_bad_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_budgets: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_budgets: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  IF p_budgets IS NULL OR jsonb_array_length(p_budgets) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE (elem->>'name') IS NULL OR (elem->>'type') IS NULL OR (elem->>'target_amount') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_budgets: one or more items are missing required fields "name", "type", or "target_amount"';
  END IF;

  WITH types AS (
    SELECT DISTINCT (elem->>'type') AS typ
    FROM jsonb_array_elements(p_budgets) AS elem
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
    RAISE EXCEPTION 'insert_budgets: invalid transaction_type: %', v_invalid_type;
  END IF;

  -- target_amount must be a plain positive number: budgets.target_amount has
  -- CHECK (target_amount > 0), which would otherwise surface as a generic
  -- sanitized "insert_budgets failed" (see the WHEN others branch below)
  -- instead of a message naming the offending budget.
  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE (elem->>'target_amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: target_amount for budget "%" is not a valid number', v_bad_name;
  END IF;

  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE (elem->>'target_amount')::numeric <= 0
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: target_amount for budget "%" must be greater than 0', v_bad_name;
  END IF;

  -- budgets.target_amount is NUMERIC(12,2): reject values that would
  -- otherwise hit the column's native "numeric field overflow" (sanitized by
  -- the WHEN others branch below) instead of naming the offending budget.
  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE (elem->>'target_amount')::numeric >= 10 ^ 10
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: target_amount for budget "%" exceeds the maximum allowed value', v_bad_name;
  END IF;

  -- categories/tags, if present, must be JSON arrays (not scalars, and not
  -- an explicit JSON null) — jsonb_array_elements_text below would otherwise
  -- raise a native "cannot extract elements from a scalar" error, sanitized
  -- by the WHEN others branch instead of naming the offending budget.
  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE elem->'categories' IS NOT NULL
    AND jsonb_typeof(elem->'categories') NOT IN ('array', 'null')
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: categories for budget "%" must be an array', v_bad_name;
  END IF;

  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE elem->'tags' IS NOT NULL
    AND jsonb_typeof(elem->'tags') NOT IN ('array', 'null')
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: tags for budget "%" must be an array', v_bad_name;
  END IF;

  -- start_date/end_date, if present, must be plain ISO dates, and, together,
  -- satisfy budgets' CHECK (start_date <= end_date) for the same reason.
  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE (elem->>'start_date') IS NOT NULL
    AND (elem->>'start_date') !~ '^\d{4}-\d{2}-\d{2}$'
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: start_date for budget "%" is not a valid date (expected YYYY-MM-DD)', v_bad_name;
  END IF;

  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE (elem->>'end_date') IS NOT NULL
    AND (elem->>'end_date') !~ '^\d{4}-\d{2}-\d{2}$'
  LIMIT 1;

  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: end_date for budget "%" is not a valid date (expected YYYY-MM-DD)', v_bad_name;
  END IF;

  -- The regex above only checks shape, not calendar validity (e.g.
  -- "2026-02-30" matches but isn't a real date). Catch that here so it
  -- surfaces the same friendly, budget-naming message instead of the
  -- native "date/time field value out of range" error the INSERT below
  -- would otherwise raise (sanitized by the WHEN others branch). The
  -- start<=end check rides along in the same pass (reusing the already-
  -- parsed dates instead of re-casting them in a second full scan), but
  -- still only raises after every element's dates have been confirmed
  -- calendar-valid — same error precedence as two separate passes.
  v_range_bad_name := NULL;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_budgets)
  LOOP
    v_start_date := NULL;
    v_end_date := NULL;

    IF v_elem->>'start_date' IS NOT NULL THEN
      BEGIN
        v_start_date := (v_elem->>'start_date')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'insert_budgets: start_date for budget "%" is not a valid date (expected YYYY-MM-DD)', v_elem->>'name';
      END;
    END IF;

    IF v_elem->>'end_date' IS NOT NULL THEN
      BEGIN
        v_end_date := (v_elem->>'end_date')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'insert_budgets: end_date for budget "%" is not a valid date (expected YYYY-MM-DD)', v_elem->>'name';
      END;
    END IF;

    IF v_range_bad_name IS NULL AND v_start_date IS NOT NULL AND v_end_date IS NOT NULL
        AND v_start_date > v_end_date THEN
      v_range_bad_name := v_elem->>'name';
    END IF;
  END LOOP;

  IF v_range_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: start_date must be on or before end_date for budget "%"', v_range_bad_name;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_budgets)
  LOOP
    v_type := (v_elem->>'type')::public.transaction_type;

    INSERT INTO public.budgets (user_id, name, description, type, target_amount, start_date, end_date)
    VALUES (
      p_user_id,
      v_elem->>'name',
      v_elem->>'description',
      v_type,
      (v_elem->>'target_amount')::numeric,
      (v_elem->>'start_date')::date,
      (v_elem->>'end_date')::date
    )
    ON CONFLICT (user_id, name) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id INTO v_budget_id;

    IF v_budget_id IS NOT NULL THEN
      v_inserted_count := v_inserted_count + 1;

      IF v_elem->>'categories' IS NOT NULL THEN
        FOR v_cat_raw IN SELECT jsonb_array_elements_text(v_elem->'categories')
        LOOP
          v_slash_pos := position('/' in v_cat_raw);

          IF v_slash_pos > 0 THEN
            v_parent_part := trim(substring(v_cat_raw from 1 for v_slash_pos - 1));
            v_child_part  := trim(substring(v_cat_raw from v_slash_pos + 1));

            SELECT c.id INTO v_parent_id
            FROM public.categories c
            WHERE c.user_id = p_user_id
              AND c.type = v_type
              AND c.name = v_parent_part
              AND c.parent_id IS NULL
              AND c.deleted_at IS NULL
            LIMIT 1;

            IF v_parent_id IS NULL THEN
              RAISE EXCEPTION 'insert_budgets: category parent "%" not found for type "%"', v_parent_part, v_type;
            END IF;

            SELECT c.id INTO v_cat_id
            FROM public.categories c
            WHERE c.user_id = p_user_id
              AND c.type = v_type
              AND c.name = v_child_part
              AND c.parent_id = v_parent_id
              AND c.deleted_at IS NULL
            LIMIT 1;

            IF v_cat_id IS NULL THEN
              RAISE EXCEPTION 'insert_budgets: category "%/%" not found', v_parent_part, v_child_part;
            END IF;
          ELSE
            SELECT c.id INTO v_cat_id
            FROM public.categories c
            WHERE c.user_id = p_user_id
              AND c.type = v_type
              AND c.name = v_cat_raw
              AND c.parent_id IS NULL
              AND c.deleted_at IS NULL
            LIMIT 1;

            IF v_cat_id IS NULL THEN
              RAISE EXCEPTION 'insert_budgets: category "%" not found as a root-level category for type "%"', v_cat_raw, v_type;
            END IF;
          END IF;

          INSERT INTO public.budget_categories (budget_id, category_id)
          VALUES (v_budget_id, v_cat_id)
          ON CONFLICT (budget_id, category_id) DO NOTHING;
        END LOOP;
      END IF;

      IF v_elem->>'tags' IS NOT NULL THEN
        FOR v_tag_name IN SELECT jsonb_array_elements_text(v_elem->'tags')
        LOOP
          SELECT t.id INTO v_tag_id
          FROM public.tags t
          WHERE t.user_id = p_user_id
            AND t.name = v_tag_name
            AND t.deleted_at IS NULL
          LIMIT 1;

          IF v_tag_id IS NULL THEN
            RAISE EXCEPTION 'insert_budgets: tag "%" not found', v_tag_name;
          END IF;

          INSERT INTO public.budget_tags (budget_id, tag_id)
          VALUES (v_budget_id, v_tag_id)
          ON CONFLICT (budget_id, tag_id) DO NOTHING;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_budgets failed' USING ERRCODE = SQLSTATE;
END;
$$;

COMMENT ON FUNCTION insert_budgets IS
  'Batch-insert budgets for a user, ON CONFLICT DO NOTHING for duplicates (by name, among non-deleted budgets). Optional "categories" (bare root-level name, parent or leaf, or "Parent/Child" path) and "tags" (bare name) entries are resolved against that user''s live rows and linked via budget_categories/budget_tags for newly-inserted budgets only.';

-- Wire budgets into bulk_upload_data, after tags (so categories/tags added
-- earlier in the same payload are available for budget category/tag
-- resolution) and before transactions.
CREATE OR REPLACE FUNCTION public.bulk_upload_data (p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_categories_inserted int := 0;
  v_bank_accounts_inserted int := 0;
  v_tags_inserted int := 0;
  v_budgets_inserted int := 0;
  v_transactions_inserted int := 0;
  v_tx_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'bulk_upload_data: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_payload ? 'categories' AND p_payload->'categories' IS NOT NULL THEN
    v_categories_inserted := public.insert_categories(v_user_id, p_payload->'categories');
  END IF;

  IF p_payload ? 'bank_accounts' AND p_payload->'bank_accounts' IS NOT NULL THEN
    v_bank_accounts_inserted := public.insert_bank_accounts(v_user_id, p_payload->'bank_accounts');
  END IF;

  IF p_payload ? 'tags' AND p_payload->'tags' IS NOT NULL THEN
    v_tags_inserted := public.insert_tags(v_user_id, p_payload->'tags');
  END IF;

  IF p_payload ? 'budgets' AND p_payload->'budgets' IS NOT NULL THEN
    v_budgets_inserted := public.insert_budgets(v_user_id, p_payload->'budgets');
  END IF;

  IF p_payload ? 'transactions' AND p_payload->'transactions' IS NOT NULL THEN
    v_tx_result := public.bulk_insert_transactions(p_payload->'transactions');
    IF v_tx_result IS NOT NULL AND v_tx_result ? 'inserted_count' THEN
      v_transactions_inserted := (v_tx_result->>'inserted_count')::int;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'categories_inserted', v_categories_inserted,
    'bank_accounts_inserted', v_bank_accounts_inserted,
    'tags_inserted', v_tags_inserted,
    'budgets_inserted', v_budgets_inserted,
    'transactions_inserted', v_transactions_inserted
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'bulk_upload_data failed' USING ERRCODE = SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.bulk_upload_data IS
  'Bulk-imports categories, bank_accounts, tags, budgets, and transactions from a single JSON payload for the authenticated user. Each section is optional. Budgets are inserted after categories/tags (so same-payload categories/tags are available for budget category/tag resolution) and before transactions.';

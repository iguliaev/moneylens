-- Re-assert insert_categories and insert_budgets exactly as they already
-- exist in production, to fix drift discovered on the staging project.
--
-- Staging's supabase_migrations.schema_migrations ledger recorded versions
-- 20260801103000 (insert_categories_parent_field) and 20260822131811
-- (insert_budgets) as applied, but the *content* actually running on
-- staging for both functions was an earlier draft of each — missing the
-- "live root-level parent" validation in insert_categories, and still
-- enforcing a leaf-only restriction (via a category_hierarchy join) in
-- insert_budgets' bare-name category lookup that the merged migration's own
-- comments explicitly say was intentionally removed (a budget, unlike a
-- transaction, may legitimately target a parent category).
--
-- Root cause: `supabase db push` is idempotent by migration *version*, not
-- content. Pushing a draft of one of these migrations from a local checkout
-- against the staging project while the PR was still in progress caused
-- staging to record that version as applied using the draft's SQL. When the
-- PR later merged to main with revised, final content under the same
-- filename/timestamp, CI's deploy-staging workflow saw the version already
-- marked applied and skipped it, so the final content never reached
-- staging. Production was unaffected (confirmed via direct inspection:
-- its function bodies already match the current migration files).
--
-- This migration carries no logic changes of its own — it just re-issues
-- CREATE OR REPLACE FUNCTION for both functions with today's correct,
-- already-in-production bodies, forcing staging back in sync.

CREATE OR REPLACE FUNCTION insert_categories (p_user_id UUID, p_categories jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_conflict_name text;
  v_unresolved_parent text;
  v_unresolved_type text;
  v_root_inserted int := 0;
  v_child_inserted int := 0;
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

  -- A name cannot be both a parent (referenced via another element's
  -- "parent") and itself a child (has its own non-empty "parent") in the
  -- same batch — the schema caps hierarchy at 2 levels.
  SELECT p.name INTO v_conflict_name
  FROM (
    SELECT DISTINCT (elem->>'type') AS typ, trim(elem->>'parent') AS name
    FROM jsonb_array_elements(p_categories) AS elem
    WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
  ) p
  JOIN (
    SELECT DISTINCT (elem->>'type') AS typ, trim(elem->>'name') AS name
    FROM jsonb_array_elements(p_categories) AS elem
    WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
  ) c ON c.typ = p.typ AND c.name = p.name
  LIMIT 1;

  IF v_conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_categories: category "%" cannot be both a parent and a child in the same batch (max 2 levels)', v_conflict_name;
  END IF;

  -- Phase 1: root-level categories. Explicit entries with no "parent", plus
  -- every distinct "parent" name referenced by a nested entry, auto-vivified
  -- with a NULL description. DISTINCT ON with a priority column makes
  -- explicit entries (priority 0) win over auto-derived ones (priority 1)
  -- when the same (type, name) appears as both.
  INSERT INTO public.categories (user_id, type, name, description)
  SELECT p_user_id, t, n, d
  FROM (
    SELECT DISTINCT ON (t, n) t, n, d
    FROM (
      SELECT (elem->>'type')::public.transaction_type AS t,
             trim(elem->>'name') AS n,
             elem->>'description' AS d,
             0 AS priority
      FROM jsonb_array_elements(p_categories) AS elem
      WHERE elem->>'parent' IS NULL OR trim(elem->>'parent') = ''
      UNION ALL
      SELECT (elem->>'type')::public.transaction_type AS t,
             trim(elem->>'parent') AS n,
             NULL::text AS d,
             1 AS priority
      FROM jsonb_array_elements(p_categories) AS elem
      WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
    ) combined
    ORDER BY t, n, priority
  ) roots
  ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

  GET DIAGNOSTICS v_root_inserted = ROW_COUNT;

  -- Every nested entry's parent must now resolve to a LIVE root-level
  -- category. Phase 1 auto-vivifies missing parents, so the only way this
  -- fails is when the name is already taken by a soft-deleted root (the
  -- unique constraint counts soft-deleted rows, so phase 1's ON CONFLICT
  -- DO NOTHING could not create a live one). Fail loudly rather than
  -- silently skipping the child row or nesting it under a deleted parent.
  SELECT trim(elem->>'parent'), elem->>'type'
  INTO v_unresolved_parent, v_unresolved_type
  FROM jsonb_array_elements(p_categories) AS elem
  WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.user_id = p_user_id
        AND c.type = (elem->>'type')::public.transaction_type
        AND c.name = trim(elem->>'parent')
        AND c.parent_id IS NULL
        AND c.deleted_at IS NULL
    )
  LIMIT 1;

  IF v_unresolved_parent IS NOT NULL THEN
    RAISE EXCEPTION 'insert_categories: parent category "%" not found as a live root-level category for type "%"',
      v_unresolved_parent, v_unresolved_type;
  END IF;

  -- Phase 2: nested categories. Resolve each "parent" name against that
  -- user's live root-level (parent_id IS NULL, deleted_at IS NULL)
  -- categories of the same type and insert the child under it.
  INSERT INTO public.categories (user_id, type, name, description, parent_id)
  SELECT p_user_id, t, n, d, pid
  FROM (
    SELECT
      (elem->>'type')::public.transaction_type AS t,
      trim(elem->>'name') AS n,
      elem->>'description' AS d,
      (
        SELECT c.id FROM public.categories c
        WHERE c.user_id = p_user_id
          AND c.type = (elem->>'type')::public.transaction_type
          AND c.name = trim(elem->>'parent')
          AND c.parent_id IS NULL
          AND c.deleted_at IS NULL
        LIMIT 1
      ) AS pid
    FROM jsonb_array_elements(p_categories) AS elem
    WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
  ) children
  ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

  GET DIAGNOSTICS v_child_inserted = ROW_COUNT;

  RETURN v_root_inserted + v_child_inserted;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_categories failed' USING ERRCODE = SQLSTATE;
END;
$$;

COMMENT ON FUNCTION insert_categories IS
  'Batch-insert categories for a user, ON CONFLICT DO NOTHING for duplicates. An entry may carry an optional "parent" field (bare root-level category name, same type) to create it as a nested (2nd-level) category; the parent is auto-created as a root category if it does not already exist. A name cannot be both a parent and a child in the same batch (max 2 levels).';

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
  'Batch-insert budgets for a user, ON CONFLICT DO NOTHING for duplicates (by name, among non-deleted budgets). Optional "categories" (bare root-leaf name or "Parent/Child" path) and "tags" (bare name) entries are resolved against that user''s live rows and linked via budget_categories/budget_tags for newly-inserted budgets only.';

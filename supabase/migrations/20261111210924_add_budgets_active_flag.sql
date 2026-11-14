-- Budgets: an `active` flag that controls whether a budget appears on the dashboard.
--
-- Visibility used to be implicit (every budget was listed). It is now an explicit
-- per-budget flag, independent of the budget's dates and of the year selected on the
-- dashboard. The flag does NOT affect matching: an inactive budget still computes
-- current_amount, so it can be reactivated without losing history.
--
-- Defaults to true everywhere (column default, create_budget_with_links, insert_budgets),
-- so existing budgets and any payload that omits the field keep showing up.
--
-- Re-asserted in full (CREATE OR REPLACE where possible, not diffed, per repo convention):
-- the view, get_budget_progress(), create_/update_budget_with_links, insert_budgets.

-- ============================================================================
-- budgets.active
-- ============================================================================
ALTER TABLE public.budgets ADD COLUMN active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.budgets.active IS 'Whether the budget is shown on the dashboard. Does not affect matching: inactive budgets still compute current_amount.';

-- ============================================================================
-- budgets_with_linked view
-- ============================================================================
-- b.* now includes active ahead of category_count/tag_count, which CREATE OR REPLACE VIEW
-- cannot do (it cannot insert a column mid-list), so the view is dropped and recreated.
-- Nothing depends on it, and its grants come from the schema's default privileges.
DROP VIEW public.budgets_with_linked;

CREATE VIEW
    public.budgets_with_linked
WITH
    (security_invoker = TRUE) AS
WITH
    bc_counts AS (
        SELECT bc.budget_id, COUNT(*) AS cnt
        FROM public.budget_categories bc
        JOIN public.categories c ON c.id = bc.category_id AND c.deleted_at IS NULL
        GROUP BY bc.budget_id
    ),
    bt_counts AS (
        SELECT bt.budget_id, COUNT(*) AS cnt
        FROM public.budget_tags bt
        JOIN public.tags t ON t.id = bt.tag_id AND t.deleted_at IS NULL
        GROUP BY bt.budget_id
    ),
    budget_txns AS (
        SELECT b.id AS budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        LEFT JOIN bc_counts bcc ON bcc.budget_id = b.id
        LEFT JOIN bt_counts btc ON btc.budget_id = b.id
        JOIN public.transactions tx
            ON  tx.user_id     = b.user_id
            AND tx.type        = b.type
            AND tx.deleted_at IS NULL
            AND (b.start_date IS NULL OR tx.date >= b.start_date)
            AND (b.end_date   IS NULL OR tx.date <= b.end_date)
        WHERE b.deleted_at IS NULL
          -- a budget with no live links matches nothing
          AND (COALESCE(bcc.cnt, 0) > 0 OR COALESCE(btc.cnt, 0) > 0)
          -- category set: unconstrained when empty, else the transaction's
          -- category is a linked one or a descendant of one
          AND (
              COALESCE(bcc.cnt, 0) = 0
              OR EXISTS (
                  SELECT 1
                  FROM public.budget_categories bc
                  JOIN public.categories cat
                      ON cat.id = bc.category_id AND cat.deleted_at IS NULL
                  JOIN public.category_hierarchy ch
                      ON ch.ancestor_id = bc.category_id
                  WHERE bc.budget_id = b.id
                    AND ch.descendant_id = tx.category_id
              )
          )
          -- tag set: unconstrained when empty, else the transaction carries
          -- at least one linked tag
          AND (
              COALESCE(btc.cnt, 0) = 0
              OR EXISTS (
                  SELECT 1
                  FROM public.budget_tags bt
                  JOIN public.tags tg
                      ON tg.id = bt.tag_id AND tg.deleted_at IS NULL
                  JOIN public.transaction_tags tt ON tt.tag_id = bt.tag_id
                  WHERE bt.budget_id = b.id
                    AND tt.transaction_id = tx.id
              )
          )
    ),
    budget_amounts AS (
        SELECT budget_id, SUM(amount) AS current_amount
        FROM budget_txns
        GROUP BY budget_id
    )
SELECT
    b.*,
    COALESCE(bc.cnt,  0) AS category_count,
    COALESCE(bt.cnt,  0) AS tag_count,
    COALESCE(ba.current_amount, 0) AS current_amount
FROM public.budgets b
LEFT JOIN bc_counts      bc ON bc.budget_id = b.id
LEFT JOIN bt_counts      bt ON bt.budget_id = b.id
LEFT JOIN budget_amounts ba ON ba.budget_id = b.id
WHERE b.deleted_at IS NULL;

-- ============================================================================
-- get_budget_progress() RPC — thin wrapper over the view, now also returning active
-- ============================================================================
-- The return type changes, so the function is dropped and recreated.
DROP FUNCTION public.get_budget_progress ();

CREATE FUNCTION public.get_budget_progress () RETURNS TABLE (
    id UUID,
    NAME TEXT,
    description TEXT,
    TYPE transaction_type,
    target_amount NUMERIC,
    start_date DATE,
    end_date DATE,
    active BOOLEAN,
    current_amount NUMERIC,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE SQL SECURITY INVOKER
SET
    search_path = '' AS $$
    SELECT
        v.id,
        v.name,
        v.description,
        v.type,
        v.target_amount,
        v.start_date,
        v.end_date,
        v.active,
        v.current_amount,
        v.created_at,
        v.updated_at
    FROM public.budgets_with_linked v
    WHERE v.user_id = auth.uid()
    ORDER BY v.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_budget_progress () IS 'Returns all non-deleted budgets for the current user with the accumulated transaction amount and the active flag. Thin wrapper over budgets_with_linked, which owns the match rule.';

GRANT
EXECUTE ON FUNCTION public.get_budget_progress () TO authenticated;

-- ============================================================================
-- create_budget_with_links / update_budget_with_links accept "active"
-- ============================================================================
-- create: a missing "active" means true. update: a missing "active" leaves it unchanged.
CREATE OR REPLACE FUNCTION public.create_budget_with_links(
  p_budget       jsonb,
  p_category_ids uuid[],
  p_tag_ids      uuid[]
) RETURNS public.budgets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_budget public.budgets;
BEGIN
  -- Validate all categories belong to current user (must be non-deleted)
  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_category_ids) AS cid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories WHERE id = cid AND user_id = auth.uid() AND deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'One or more categories not found or access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validate all tags belong to current user (must be non-deleted)
  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_tag_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags WHERE id = tid AND user_id = auth.uid() AND deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'One or more tags not found or access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- tg_budgets_user_id trigger will set user_id = auth.uid() on INSERT
  INSERT INTO public.budgets (
    name, description, type, target_amount, start_date, end_date, active
  ) VALUES (
    p_budget->>'name',
    p_budget->>'description',
    (p_budget->>'type')::public.transaction_type,
    (p_budget->>'target_amount')::numeric,
    (p_budget->>'start_date')::date,
    (p_budget->>'end_date')::date,
    COALESCE((p_budget->>'active')::boolean, true)
  )
  RETURNING * INTO v_budget;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO public.budget_categories (budget_id, category_id)
    SELECT v_budget.id, unnest(p_category_ids)
    ON CONFLICT (budget_id, category_id) DO NOTHING;
  END IF;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.budget_tags (budget_id, tag_id)
    SELECT v_budget.id, unnest(p_tag_ids)
    ON CONFLICT (budget_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_budget;
END;
$$;

CREATE OR REPLACE FUNCTION update_budget_with_links(p_budget_id uuid, p_budget jsonb, p_category_ids uuid[], p_tag_ids uuid[]) RETURNS budgets LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_budget public.budgets;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.budgets
    WHERE id = p_budget_id AND user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Budget not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate all categories belong to current user (must be non-deleted)
  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_category_ids) AS cid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories WHERE id = cid AND user_id = auth.uid() AND deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'One or more categories not found or access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validate all tags belong to current user (must be non-deleted)
  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_tag_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags WHERE id = tid AND user_id = auth.uid() AND deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'One or more tags not found or access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.budgets SET
    name          = p_budget->>'name',
    description   = p_budget->>'description',
    type          = (p_budget->>'type')::public.transaction_type,
    target_amount = (p_budget->>'target_amount')::numeric,
    start_date    = (p_budget->>'start_date')::date,
    end_date      = (p_budget->>'end_date')::date,
    -- a payload without "active" leaves the flag as it is
    active        = COALESCE((p_budget->>'active')::boolean, active)
  WHERE id = p_budget_id AND user_id = auth.uid() AND deleted_at IS NULL
  RETURNING * INTO v_budget;

  -- Guards against a TOCTOU race (e.g. a concurrent soft-delete between the
  -- ownership check above and this UPDATE): without this, a zero-row UPDATE
  -- would silently leave v_budget as an all-NULL composite and RETURN it as
  -- if the save had succeeded.
  IF v_budget.id IS NULL THEN
    RAISE EXCEPTION 'Budget not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Replace all category associations atomically
  DELETE FROM public.budget_categories WHERE budget_id = p_budget_id;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO public.budget_categories (budget_id, category_id)
    SELECT p_budget_id, unnest(p_category_ids)
    ON CONFLICT (budget_id, category_id) DO NOTHING;
  END IF;

  -- Replace all tag associations atomically
  DELETE FROM public.budget_tags WHERE budget_id = p_budget_id;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.budget_tags (budget_id, tag_id)
    SELECT p_budget_id, unnest(p_tag_ids)
    ON CONFLICT (budget_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_budget;
END;
$$;

-- ============================================================================
-- insert_budgets (bulk upload / JSON import) accepts "active"
-- ============================================================================
-- Optional boolean in each BudgetInput; missing or null means true.
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

  -- "active", if present, must be a JSON boolean (or null, meaning the default).
  SELECT elem->>'name' INTO v_bad_name
  FROM jsonb_array_elements(p_budgets) AS elem
  WHERE elem ? 'active'
    AND jsonb_typeof(elem->'active') NOT IN ('boolean', 'null')
  LIMIT 1;
  IF v_bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_budgets: active for budget "%" must be a boolean', v_bad_name;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_budgets)
  LOOP
    v_type := (v_elem->>'type')::public.transaction_type;

    INSERT INTO public.budgets (user_id, name, description, type, target_amount, start_date, end_date, active)
    VALUES (
      p_user_id,
      v_elem->>'name',
      v_elem->>'description',
      v_type,
      (v_elem->>'target_amount')::numeric,
      (v_elem->>'start_date')::date,
      (v_elem->>'end_date')::date,
      COALESCE((v_elem->>'active')::boolean, true)
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


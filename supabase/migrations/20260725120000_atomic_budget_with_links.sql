-- supabase/migrations/20260725120000_atomic_budget_with_links.sql

-- ============================================================
-- create_budget_with_links
-- Inserts a budget and links categories/tags in one DB transaction.
-- Atomicity: if category/tag linking fails (e.g. invalid FK or
-- ownership check), the whole operation rolls back — no orphan budget.
-- ============================================================
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
    name, description, type, target_amount, start_date, end_date
  ) VALUES (
    p_budget->>'name',
    p_budget->>'description',
    (p_budget->>'type')::public.transaction_type,
    (p_budget->>'target_amount')::numeric,
    (p_budget->>'start_date')::date,
    (p_budget->>'end_date')::date
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

COMMENT ON FUNCTION public.create_budget_with_links IS
  'Atomically creates a budget and sets its category/tag associations in one DB transaction.';

GRANT EXECUTE ON FUNCTION public.create_budget_with_links(jsonb, uuid[], uuid[]) TO authenticated;

-- ============================================================
-- update_budget_with_links
-- Updates a budget and replaces all category/tag associations atomically.
-- Raises 42501 if the caller does not own p_budget_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_budget_with_links(
  p_budget_id    uuid,
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
    end_date      = (p_budget->>'end_date')::date
  WHERE id = p_budget_id AND user_id = auth.uid()
  RETURNING * INTO v_budget;

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

COMMENT ON FUNCTION public.update_budget_with_links IS
  'Atomically updates a budget and replaces all category/tag associations in one DB transaction.';

GRANT EXECUTE ON FUNCTION public.update_budget_with_links(uuid, jsonb, uuid[], uuid[]) TO authenticated;

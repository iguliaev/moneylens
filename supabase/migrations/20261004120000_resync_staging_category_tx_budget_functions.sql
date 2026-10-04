-- Re-assert validate_category_parent, create_transaction_with_tags,
-- update_budget_with_links, and tg_set_user_id exactly as they already
-- exist in production, to fix further drift discovered on the staging
-- project (same class of issue as 20261003140000).
--
-- Comparing every function, trigger, view, and RLS policy definition
-- between staging and production (via direct introspection) found these
-- four additionally out of sync, even though both projects' migration
-- ledgers list the identical set of applied versions:
--
--   - validate_category_parent (from 20260601210000_add_category_hierarchy.sql):
--     staging's trigger function was missing the cross-user ownership check
--     ("Parent category must belong to the same user") and the 2-level
--     hierarchy enforcement in both directions. Without the ownership
--     check, nothing prevented a category's parent_id from being set to
--     another user's category.
--   - create_transaction_with_tags (from 20260510120000_atomic_transaction_with_tags.sql):
--     staging was missing the "deleted_at IS NULL" filters on the
--     category/bank_account/tag ownership checks, so a soft-deleted
--     category, bank account, or tag could still be referenced.
--   - update_budget_with_links (from 20260725120000_atomic_budget_with_links.sql):
--     staging was missing the TOCTOU guard that catches a concurrent
--     soft-delete between the initial ownership check and the UPDATE,
--     which could otherwise silently return an all-NULL budget as if the
--     save had succeeded.
--   - tg_set_user_id: cosmetic only (whitespace/indentation), included here
--     purely so staging matches production byte-for-byte.
--
-- As with 20261003140000, each source migration file has only ever been
-- committed once in git — the draft content predates that single commit,
-- so this is the same `supabase db push`-is-idempotent-by-version footgun,
-- just caught later via a full function/trigger/view/policy diff rather
-- than the one bug report that caught the first two.
--
-- No logic changes of its own: bodies verified byte-identical to
-- production's pg_get_functiondef output before committing.

CREATE OR REPLACE FUNCTION validate_category_parent() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_parent_type public.transaction_type;
  v_parent_user_id uuid;
BEGIN
  IF new.parent_id IS NULL THEN
    RETURN new;
  END IF;

  -- Prevent self-parent
  IF new.parent_id = new.id THEN
    RAISE EXCEPTION 'Category cannot be parent of itself';
  END IF;

  -- Verify parent exists, belongs to same user, and has same type
  SELECT type, user_id INTO v_parent_type, v_parent_user_id
  FROM public.categories WHERE id = new.parent_id;

  IF v_parent_user_id IS DISTINCT FROM new.user_id THEN
    RAISE EXCEPTION 'Parent category must belong to the same user';
  END IF;

  IF v_parent_type IS DISTINCT FROM new.type THEN
    RAISE EXCEPTION 'Parent category must have same type';
  END IF;

  -- Enforce max 2-level hierarchy: proposed parent must be a root
  IF (SELECT parent_id FROM public.categories WHERE id = new.parent_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Parent category already has a parent — max 2 levels allowed';
  END IF;

  -- Enforce max 2-level hierarchy: cannot assign parent to a category that already has children
  IF EXISTS (
    SELECT 1 FROM public.category_hierarchy
    WHERE ancestor_id = new.id AND depth = 1
  ) THEN
    RAISE EXCEPTION 'Cannot assign a parent to a category that already has children';
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION create_transaction_with_tags(p_transaction jsonb, p_tag_ids uuid[]) RETURNS transactions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_transaction public.transactions;
BEGIN
  -- Validate category ownership (must be non-deleted)
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = (p_transaction->>'category_id')::uuid AND user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Category not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate bank account ownership (must be non-deleted)
  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts
    WHERE id = (p_transaction->>'bank_account_id')::uuid AND user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bank account not found or access denied' USING ERRCODE = '42501';
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

  -- tg_set_user_id trigger will set user_id = auth.uid() on INSERT
  INSERT INTO public.transactions (
    date, type, amount, category_id, bank_account_id, notes
  ) VALUES (
    (p_transaction->>'date')::date,
    (p_transaction->>'type')::public.transaction_type,
    (p_transaction->>'amount')::numeric,
    (p_transaction->>'category_id')::uuid,
    (p_transaction->>'bank_account_id')::uuid,
    p_transaction->>'notes'
  )
  RETURNING * INTO v_transaction;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    SELECT v_transaction.id, unnest(p_tag_ids)
    ON CONFLICT (transaction_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_transaction;
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
    end_date      = (p_budget->>'end_date')::date
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

CREATE OR REPLACE FUNCTION tg_set_user_id() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

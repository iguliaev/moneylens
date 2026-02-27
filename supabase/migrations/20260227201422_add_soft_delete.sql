-- Migration: Add soft delete support
-- Adds deleted_at column to user-facing tables and updates all views/RPCs to
-- exclude soft-deleted rows. The reset_user_data function remains a hard delete.

-- ============================================================================
-- 1. Add deleted_at columns
-- ============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Indexes for efficient filtering of non-deleted rows per user
CREATE INDEX IF NOT EXISTS idx_transactions_user_deleted ON public.transactions (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_user_deleted ON public.categories (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_deleted ON public.bank_accounts (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tags_user_deleted ON public.tags (user_id, deleted_at);

-- ============================================================================
-- 2. Drop views that need to be recreated (reverse dependency order)
-- ============================================================================

DROP VIEW IF EXISTS public.tags_with_usage CASCADE;
DROP VIEW IF EXISTS public.bank_accounts_with_usage CASCADE;
DROP VIEW IF EXISTS public.categories_with_usage CASCADE;
DROP VIEW IF EXISTS public.transactions_with_details CASCADE;
DROP VIEW IF EXISTS public.view_tagged_type_totals CASCADE;
DROP VIEW IF EXISTS public.view_yearly_tagged_type_totals CASCADE;
DROP VIEW IF EXISTS public.view_monthly_tagged_type_totals CASCADE;
DROP VIEW IF EXISTS public.view_yearly_category_totals CASCADE;
DROP VIEW IF EXISTS public.view_monthly_category_totals CASCADE;
DROP VIEW IF EXISTS public.view_yearly_totals CASCADE;
DROP VIEW IF EXISTS public.view_monthly_totals CASCADE;
DROP VIEW IF EXISTS public.transactions_save CASCADE;
DROP VIEW IF EXISTS public.transactions_earn CASCADE;
DROP VIEW IF EXISTS public.transactions_spend CASCADE;

-- ============================================================================
-- 3. Recreate views with deleted_at IS NULL filters
-- ============================================================================

CREATE OR REPLACE VIEW public.transactions_spend
WITH (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.type,
  t.category_id,
  COALESCE(t.category, c.name) AS category,
  t.bank_account_id,
  COALESCE(t.bank_account, b.name) AS bank_account,
  t.amount,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at
FROM transactions t
LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.type = 'spend'::transaction_type
  AND t.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.transactions_earn
WITH (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.type,
  t.category_id,
  COALESCE(t.category, c.name) AS category,
  t.bank_account_id,
  COALESCE(t.bank_account, b.name) AS bank_account,
  t.amount,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at
FROM transactions t
LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.type = 'earn'::transaction_type
  AND t.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.transactions_save
WITH (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.type,
  t.category_id,
  COALESCE(t.category, c.name) AS category,
  t.bank_account_id,
  COALESCE(t.bank_account, b.name) AS bank_account,
  t.amount,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at
FROM transactions t
LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.type = 'save'::transaction_type
  AND t.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.view_monthly_totals
WITH (security_invoker = TRUE) AS
SELECT
  user_id,
  DATE_TRUNC('month', date) AS month,
  type,
  SUM(amount) AS total
FROM transactions
WHERE deleted_at IS NULL
GROUP BY user_id, month, type
ORDER BY user_id, month DESC, type;

CREATE OR REPLACE VIEW public.view_yearly_totals
WITH (security_invoker = TRUE) AS
SELECT
  user_id,
  DATE_TRUNC('year', date) AS year,
  type,
  SUM(amount) AS total
FROM transactions
WHERE deleted_at IS NULL
GROUP BY user_id, year, type
ORDER BY user_id, year DESC, type;

CREATE OR REPLACE VIEW public.view_monthly_category_totals
WITH (security_invoker = TRUE) AS
SELECT
  t.user_id,
  DATE_TRUNC('month', t.date) AS month,
  c.name AS category,
  t.type,
  SUM(t.amount) AS total
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE t.deleted_at IS NULL
GROUP BY t.user_id, DATE_TRUNC('month', t.date), c.name, t.type
ORDER BY t.user_id, month DESC, category, t.type;

CREATE OR REPLACE VIEW public.view_yearly_category_totals
WITH (security_invoker = TRUE) AS
SELECT
  t.user_id,
  DATE_TRUNC('year', t.date) AS year,
  c.name AS category,
  t.type,
  SUM(t.amount) AS total
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE t.deleted_at IS NULL
GROUP BY t.user_id, DATE_TRUNC('year', t.date), c.name, t.type
ORDER BY t.user_id, year DESC, category, t.type;

CREATE OR REPLACE VIEW public.view_monthly_tagged_type_totals
WITH (security_invoker = TRUE) AS
WITH transaction_tags_array AS (
  SELECT
    t.id,
    t.user_id,
    t.date,
    t.type,
    t.amount,
    ARRAY_REMOVE(
      ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name),
      NULL
    ) AS tags
  FROM transactions t
  LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
  LEFT JOIN tags tg ON tt.tag_id = tg.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, t.user_id, t.date, t.type, t.amount
)
SELECT
  user_id,
  DATE_TRUNC('month', date) AS month,
  type,
  tags,
  SUM(amount) AS total
FROM transaction_tags_array
WHERE tags IS NOT NULL AND ARRAY_LENGTH(tags, 1) > 0
GROUP BY user_id, DATE_TRUNC('month', date), type, tags;

CREATE OR REPLACE VIEW public.view_yearly_tagged_type_totals
WITH (security_invoker = TRUE) AS
WITH transaction_tags_array AS (
  SELECT
    t.id,
    t.user_id,
    t.date,
    t.type,
    t.amount,
    ARRAY_REMOVE(
      ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name),
      NULL
    ) AS tags
  FROM transactions t
  LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
  LEFT JOIN tags tg ON tt.tag_id = tg.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, t.user_id, t.date, t.type, t.amount
)
SELECT
  user_id,
  DATE_TRUNC('year', date) AS year,
  type,
  tags,
  SUM(amount) AS total
FROM transaction_tags_array
WHERE tags IS NOT NULL AND ARRAY_LENGTH(tags, 1) > 0
GROUP BY user_id, DATE_TRUNC('year', date), type, tags;

CREATE OR REPLACE VIEW public.view_tagged_type_totals
WITH (security_invoker = TRUE) AS
WITH transaction_tags_array AS (
  SELECT
    t.id,
    t.user_id,
    t.type,
    t.amount,
    ARRAY_REMOVE(
      ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name),
      NULL
    ) AS tags
  FROM transactions t
  LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
  LEFT JOIN tags tg ON tt.tag_id = tg.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, t.user_id, t.type, t.amount
)
SELECT
  user_id,
  type,
  tags,
  SUM(amount) AS total
FROM transaction_tags_array
WHERE tags IS NOT NULL AND ARRAY_LENGTH(tags, 1) > 0
GROUP BY user_id, type, tags;

CREATE OR REPLACE VIEW public.transactions_with_details
WITH (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name AS category_name,
  c.type AS category_type,
  t.bank_account_id,
  ba.name AS bank_account_name,
  t.created_at,
  t.updated_at,
  ARRAY_REMOVE(
    ARRAY_AGG(DISTINCT tt.tag_id ORDER BY tt.tag_id),
    NULL
  ) AS tag_ids,
  ARRAY_REMOVE(
    ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name),
    NULL
  ) AS tag_names
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
LEFT JOIN bank_accounts ba ON t.bank_account_id = ba.id
LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
LEFT JOIN tags tg ON tt.tag_id = tg.id
WHERE t.deleted_at IS NULL
GROUP BY
  t.id, t.user_id, t.date, t.amount, t.notes, t.type,
  t.category_id, c.name, c.type,
  t.bank_account_id, ba.name,
  t.created_at, t.updated_at;

COMMENT ON VIEW public.transactions_with_details IS 'Transactions with resolved category, bank account, and tag names for UI display';

CREATE OR REPLACE VIEW public.categories_with_usage
WITH (security_invoker = TRUE) AS
SELECT
  c.id,
  c.user_id,
  c.type,
  c.name,
  c.description,
  c.created_at,
  c.updated_at,
  COALESCE(u.cnt, 0)::BIGINT AS in_use_count
FROM public.categories c
LEFT JOIN (
  SELECT
    user_id,
    category_id,
    COUNT(*)::BIGINT AS cnt
  FROM public.transactions
  WHERE category_id IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY user_id, category_id
) u ON u.user_id = c.user_id AND u.category_id = c.id
WHERE c.deleted_at IS NULL;

COMMENT ON VIEW public.categories_with_usage IS 'Per-user categories with reference counts from non-deleted transactions (in_use_count).';

CREATE OR REPLACE VIEW public.bank_accounts_with_usage
WITH (security_invoker = TRUE) AS
SELECT
  b.id,
  b.user_id,
  b.name,
  b.description,
  b.created_at,
  b.updated_at,
  COALESCE(u.cnt, 0)::BIGINT AS in_use_count
FROM public.bank_accounts b
LEFT JOIN (
  SELECT
    user_id,
    bank_account_id,
    COUNT(*)::BIGINT AS cnt
  FROM public.transactions
  WHERE bank_account_id IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY user_id, bank_account_id
) u ON u.user_id = b.user_id AND u.bank_account_id = b.id
WHERE b.deleted_at IS NULL;

COMMENT ON VIEW public.bank_accounts_with_usage IS 'Per-user bank accounts with reference counts from non-deleted transactions (in_use_count).';

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
    tr.user_id,
    x.tag,
    COUNT(*)::BIGINT AS cnt
  FROM public.transactions tr
  CROSS JOIN LATERAL UNNEST(tr.tags) AS x(tag)
  WHERE tr.deleted_at IS NULL
  GROUP BY tr.user_id, x.tag
) u ON u.user_id = g.user_id AND u.tag = g.name
WHERE g.deleted_at IS NULL;

COMMENT ON VIEW public.tags_with_usage IS 'Per-user tags with reference counts from non-deleted transactions (in_use_count).';

-- ============================================================================
-- 4. Update safe-delete RPCs to use soft delete
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_category_safe(p_category_id UUID)
RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_category_id AND c.user_id = v_uid AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002';
  END IF;

  -- Count references from non-deleted transactions
  SELECT COUNT(*) INTO in_use_count
  FROM public.transactions t
  WHERE t.category_id = p_category_id
    AND t.user_id = v_uid
    AND t.deleted_at IS NULL;

  IF in_use_count > 0 THEN
    ok := false;
    RETURN;
  END IF;

  -- Soft delete
  UPDATE public.categories
  SET deleted_at = NOW()
  WHERE id = p_category_id AND user_id = v_uid;

  ok := true;
  in_use_count := 0;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_category_safe(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_bank_account_safe(p_bank_account_id UUID)
RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts b
    WHERE b.id = p_bank_account_id AND b.user_id = v_uid AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
  END IF;

  -- Count references from non-deleted transactions
  SELECT COUNT(*) INTO in_use_count
  FROM public.transactions t
  WHERE t.bank_account_id = p_bank_account_id
    AND t.user_id = v_uid
    AND t.deleted_at IS NULL;

  IF in_use_count > 0 THEN
    ok := false;
    RETURN;
  END IF;

  -- Soft delete
  UPDATE public.bank_accounts
  SET deleted_at = NOW()
  WHERE id = p_bank_account_id AND user_id = v_uid;

  ok := true;
  in_use_count := 0;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bank_account_safe(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_tag_safe(p_tag_id UUID)
RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tags g
    WHERE g.id = p_tag_id AND g.user_id = v_uid AND g.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'P0002';
  END IF;

  -- Count references from non-deleted transactions via transaction_tags
  SELECT COUNT(*) INTO in_use_count
  FROM public.transaction_tags tt
  JOIN public.transactions t ON tt.transaction_id = t.id
  WHERE tt.tag_id = p_tag_id
    AND t.user_id = v_uid
    AND t.deleted_at IS NULL;

  IF in_use_count > 0 THEN
    ok := false;
    RETURN;
  END IF;

  -- Soft delete
  UPDATE public.tags
  SET deleted_at = NOW()
  WHERE id = p_tag_id AND user_id = v_uid;

  ok := true;
  in_use_count := 0;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tag_safe(UUID) TO authenticated;

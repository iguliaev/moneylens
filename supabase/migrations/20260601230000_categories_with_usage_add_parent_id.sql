-- 20260601230000_categories_with_usage_add_parent_id.sql
-- Add parent_id to categories_with_usage view so the frontend list can render hierarchy.

DROP VIEW IF EXISTS public.categories_with_usage;

CREATE VIEW public.categories_with_usage
WITH (security_invoker = true)
AS
  SELECT
    c.id,
    c.user_id,
    c.type,
    c.name,
    c.description,
    c.parent_id,
    c.created_at,
    c.updated_at,
    COALESCE(u.cnt, 0::bigint) AS in_use_count
  FROM categories c
  LEFT JOIN (
    SELECT
      transactions.user_id,
      transactions.category_id,
      count(*) AS cnt
    FROM transactions
    WHERE transactions.category_id IS NOT NULL
      AND transactions.deleted_at IS NULL
    GROUP BY transactions.user_id, transactions.category_id
  ) u ON u.user_id = c.user_id AND u.category_id = c.id
  WHERE c.deleted_at IS NULL;

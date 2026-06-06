-- 20260601230000_categories_with_usage_add_parent_id.sql
-- Add parent_id and child_count to categories_with_usage view.
-- parent_id: enables hierarchy rendering in the list.
-- child_count: enables leaf-only filtering in transaction forms.

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
    COALESCE(ch_kids.child_count, 0)::bigint AS child_count,
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
  LEFT JOIN (
    SELECT ancestor_id, count(*) AS child_count
    FROM category_hierarchy
    WHERE depth = 1
    GROUP BY ancestor_id
  ) ch_kids ON ch_kids.ancestor_id = c.id
  WHERE c.deleted_at IS NULL;

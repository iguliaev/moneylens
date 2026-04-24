-- ============================================================================
-- Migration: 20260419000001_rewrite_budgets_with_linked.sql
-- Purpose: Replace correlated subqueries in budgets_with_linked view with
--          LEFT JOIN + GROUP BY aggregations to avoid N×2 sub-selects.
-- ============================================================================

CREATE OR REPLACE VIEW public.budgets_with_linked
WITH (security_invoker = TRUE) AS
SELECT
    b.id,
    b.user_id,
    b.name,
    b.description,
    b.type,
    b.target_amount,
    b.start_date,
    b.end_date,
    b.deleted_at,
    b.created_at,
    b.updated_at,
    COALESCE(bc_counts.cnt, 0) AS category_count,
    COALESCE(bt_counts.cnt, 0) AS tag_count
FROM public.budgets b
LEFT JOIN (
    SELECT bc.budget_id, COUNT(*) AS cnt
    FROM public.budget_categories bc
    JOIN public.categories c ON c.id = bc.category_id AND c.deleted_at IS NULL
    GROUP BY bc.budget_id
) bc_counts ON bc_counts.budget_id = b.id
LEFT JOIN (
    SELECT bt.budget_id, COUNT(*) AS cnt
    FROM public.budget_tags bt
    JOIN public.tags t ON t.id = bt.tag_id AND t.deleted_at IS NULL
    GROUP BY bt.budget_id
) bt_counts ON bt_counts.budget_id = b.id
WHERE b.deleted_at IS NULL;

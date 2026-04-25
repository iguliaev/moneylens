-- Replace correlated scalar subqueries with LEFT JOIN aggregations.
-- The original view issued N×2 sub-selects (one per budget per count column).
-- The rewrite pre-aggregates counts in derived tables and joins once, giving
-- the planner a single pass over budget_categories and budget_tags regardless
-- of how many budgets the user has.
--
-- NOTE: The LEFT JOINs make this view non-auto-updatable in PostgreSQL.
-- This is intentional and safe: budgets_with_linked is a read-only list view.
-- All mutations (INSERT/UPDATE/DELETE) go directly to the `budgets` table.
-- No application code writes through this view.

CREATE OR REPLACE VIEW
    public.budgets_with_linked
WITH
    (security_invoker = TRUE) AS
SELECT
    b.*,
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

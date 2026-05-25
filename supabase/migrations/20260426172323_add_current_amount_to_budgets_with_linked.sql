-- Add current_amount to budgets_with_linked view so the budget list page can
-- display inline progress without a separate RPC call.
--
-- The budget_txns CTE mirrors the logic in get_budget_progress():
--   • category-matched transactions (via budget_categories)
--   • tag-matched transactions (via budget_tags / transaction_tags)
--   UNION (not UNION ALL) deduplicates transactions that satisfy both paths,
--   so each transaction is counted exactly once.
--
-- With security_invoker = TRUE, RLS on every referenced table is evaluated
-- under the calling user's role, so no cross-user data can leak.
-- The explicit WHERE b.deleted_at IS NULL matches the existing view filter.

CREATE OR REPLACE VIEW
    public.budgets_with_linked
WITH
    (security_invoker = TRUE) AS
WITH
    budget_txns AS (
        -- Transactions matched via a linked category
        SELECT bc.budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        JOIN public.budget_categories bc ON bc.budget_id = b.id
        JOIN public.categories cat
            ON cat.id = bc.category_id
            AND cat.deleted_at IS NULL
        JOIN public.transactions tx
            ON  tx.category_id = bc.category_id
            AND tx.user_id     = b.user_id
            AND tx.type        = b.type
            AND tx.deleted_at IS NULL
            AND (b.start_date IS NULL OR tx.date >= b.start_date)
            AND (b.end_date   IS NULL OR tx.date <= b.end_date)
        WHERE b.deleted_at IS NULL

        UNION

        -- Transactions matched via a linked tag
        SELECT bt.budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        JOIN public.budget_tags bt ON bt.budget_id = b.id
        JOIN public.tags tg
            ON tg.id = bt.tag_id
            AND tg.deleted_at IS NULL
        JOIN public.transaction_tags tt ON tt.tag_id = bt.tag_id
        JOIN public.transactions tx
            ON  tx.id       = tt.transaction_id
            AND tx.user_id  = b.user_id
            AND tx.type     = b.type
            AND tx.deleted_at IS NULL
            AND (b.start_date IS NULL OR tx.date >= b.start_date)
            AND (b.end_date   IS NULL OR tx.date <= b.end_date)
        WHERE b.deleted_at IS NULL
    ),
    budget_amounts AS (
        SELECT budget_id, SUM(amount) AS current_amount
        FROM budget_txns
        GROUP BY budget_id
    ),
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

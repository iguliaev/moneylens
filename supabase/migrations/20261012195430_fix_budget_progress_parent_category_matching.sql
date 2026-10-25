-- Fix budgets linked to a PARENT category matching zero transactions.
--
-- Bug: budgets/create.tsx lets a budget link to either a parent or a leaf
-- category, but transactions can only ever carry a leaf category_id. Both
-- get_budget_progress() and budgets_with_linked's budget_txns CTE joined
-- tx.category_id = bc.category_id directly, so a parent-linked budget never
-- matched any transaction via the category path — only via a tag link, if
-- it had one. Fix: join through category_hierarchy (added in
-- 20260601210000_add_category_hierarchy.sql), which carries a depth-0
-- self-row for every category and a depth-1 row for every child. A
-- leaf-linked budget's only matching hierarchy row is its self-row, so this
-- is a no-op for existing leaf-linked budgets; a parent-linked budget now
-- additionally matches its children's transactions.
--
-- Both objects are re-asserted in full (CREATE OR REPLACE), not diffed, per
-- repo convention — Postgres requires a full function/view body anyway.

-- ============================================================================
-- get_budget_progress() RPC
-- ============================================================================
CREATE
OR REPLACE FUNCTION public.get_budget_progress () RETURNS TABLE (
    id UUID,
    NAME TEXT,
    description TEXT,
    TYPE transaction_type,
    target_amount NUMERIC,
    start_date DATE,
    end_date DATE,
    current_amount NUMERIC,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE SQL SECURITY INVOKER
SET
    search_path = '' AS $$
    -- Collect all (budget_id, tx_id, amount) pairs that qualify.
    -- UNION (not UNION ALL) deduplicates transactions that match both a
    -- category link and a tag link, so each transaction is counted once.
    WITH budget_txns AS (
        -- transactions matched via a linked category (non-deleted categories only),
        -- including transactions filed under a CHILD of the linked category —
        -- category_hierarchy carries a depth-0 self-row for every category, so a
        -- leaf-linked budget still matches only its own exact category as before.
        SELECT bc.budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        JOIN public.budget_categories bc ON bc.budget_id = b.id
        JOIN public.categories cat ON cat.id = bc.category_id
                                   AND cat.deleted_at IS NULL
        JOIN public.category_hierarchy ch ON ch.ancestor_id = bc.category_id
        JOIN public.transactions tx
            ON  tx.category_id  = ch.descendant_id
            AND tx.user_id      = b.user_id
            AND tx.type         = b.type
            AND tx.deleted_at  IS NULL
            AND (b.start_date IS NULL OR tx.date >= b.start_date)
            AND (b.end_date   IS NULL OR tx.date <= b.end_date)
        WHERE b.user_id     = auth.uid()
          AND b.deleted_at IS NULL

        UNION

        -- transactions matched via a linked tag (non-deleted tags only)
        SELECT bt.budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        JOIN public.budget_tags bt ON bt.budget_id = b.id
        JOIN public.tags tg ON tg.id = bt.tag_id
                            AND tg.deleted_at IS NULL
        JOIN public.transaction_tags tt ON tt.tag_id = bt.tag_id
        JOIN public.transactions tx
            ON  tx.id           = tt.transaction_id
            AND tx.user_id      = b.user_id
            AND tx.type         = b.type
            AND tx.deleted_at  IS NULL
            AND (b.start_date IS NULL OR tx.date >= b.start_date)
            AND (b.end_date   IS NULL OR tx.date <= b.end_date)
        WHERE b.user_id     = auth.uid()
          AND b.deleted_at IS NULL
    ),
    budget_amounts AS (
        SELECT budget_id, SUM(amount) AS current_amount
        FROM budget_txns
        GROUP BY budget_id
    )
    SELECT
        b.id,
        b.name,
        b.description,
        b.type,
        b.target_amount,
        b.start_date,
        b.end_date,
        COALESCE(ba.current_amount, 0) AS current_amount,
        b.created_at,
        b.updated_at
    FROM public.budgets b
    LEFT JOIN budget_amounts ba ON ba.budget_id = b.id
    WHERE b.user_id     = auth.uid()
      AND b.deleted_at IS NULL
    ORDER BY b.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_budget_progress () IS 'Returns all active budgets for the current user with the accumulated transaction amount.';

GRANT
EXECUTE ON FUNCTION public.get_budget_progress () TO authenticated;

-- ============================================================================
-- budgets_with_linked view
-- ============================================================================

-- Add current_amount to budgets_with_linked view so the budget list page can
-- display inline progress without a separate RPC call.
--
-- The budget_txns CTE mirrors the logic in get_budget_progress():
--   • category-matched transactions (via budget_categories, traversing
--     category_hierarchy so a parent-linked budget also matches its
--     children's transactions — see this migration's header comment)
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
        -- Transactions matched via a linked category, including children of
        -- the linked category when it is a parent (see get_budget_progress()
        -- comment for why leaf-linked budgets are unaffected).
        SELECT bc.budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        JOIN public.budget_categories bc ON bc.budget_id = b.id
        JOIN public.categories cat
            ON cat.id = bc.category_id
            AND cat.deleted_at IS NULL
        JOIN public.category_hierarchy ch ON ch.ancestor_id = bc.category_id
        JOIN public.transactions tx
            ON  tx.category_id = ch.descendant_id
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

-- Budgets: AND between the linked category set and the linked tag set.
--
-- Until now a transaction counted toward a budget if its category was linked
-- OR it carried a linked tag, so a budget linking "Vacation" plus a trip tag
-- summed all vacation spending, not the trip. The transactions page filters
-- already combine the two sets with AND (OR within a set); budgets now match
-- the same way:
--
--   * categories: no live linked categories, OR the transaction's category is
--     a linked one or a descendant of one (category_hierarchy, see
--     20261012195430_fix_budget_progress_parent_category_matching.sql)
--   * tags: no live linked tags, OR the transaction has a linked tag
--   * ...AND both of the above, AND type/user/date-window as before.
--
-- An empty set is "no constraint", so category-only and tag-only budgets match
-- exactly what they matched before. A budget with NO live links matches
-- nothing (current_amount = 0) — without that guard it would match every
-- transaction of its type. "Live" = the linked category/tag is not
-- soft-deleted, so a budget whose only tag was deleted also matches nothing
-- instead of widening to everything.
--
-- The UNION of the two match paths (and its de-duplication) is gone: a
-- transaction either satisfies the single combined predicate or it does not,
-- so it is counted once by construction.
--
-- get_budget_progress() has had no frontend caller since #174. Rather than
-- keep a second copy of the match rule that can drift from the view, it is
-- re-asserted as a thin wrapper over budgets_with_linked, so the rule lives
-- in exactly one place.

-- ============================================================================
-- budgets_with_linked view
-- ============================================================================
CREATE OR REPLACE VIEW
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
-- get_budget_progress() RPC — thin wrapper over the view
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
    SELECT
        v.id,
        v.name,
        v.description,
        v.type,
        v.target_amount,
        v.start_date,
        v.end_date,
        v.current_amount,
        v.created_at,
        v.updated_at
    FROM public.budgets_with_linked v
    WHERE v.user_id = auth.uid()
    ORDER BY v.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_budget_progress () IS 'Returns all active budgets for the current user with the accumulated transaction amount. Thin wrapper over budgets_with_linked, which owns the match rule.';

GRANT
EXECUTE ON FUNCTION public.get_budget_progress () TO authenticated;

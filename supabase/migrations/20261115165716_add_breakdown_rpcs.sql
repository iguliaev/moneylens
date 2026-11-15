-- ============================================================================
-- Dashboard Breakdown tab: totals per category / tag / bank account over a period
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-10-24-breakdown-tab-design.md
--
-- Three functions, all SECURITY INVOKER (RLS applies) and scoped to auth.uid():
--   breakdown_matches        the single place that decides which transactions
--                            belong to which entity (shared by the other two)
--   get_breakdown            ranked list: one row per entity
--   get_breakdown_monthly    one entity's totals per calendar month
--
-- Decisions (spec open questions):
--   * Untagged transactions are omitted from the tag dimension.
--   * Transactions pointing at a soft-deleted category/tag/bank account still
--     count, under the name stored on the deleted row.
--   * A transaction with no category / no bank account is reported as its own
--     row ("Uncategorised" / "No account") with a NULL entity_id, so a
--     dimension's rows never silently lose money.
--   * A transaction with several tags counts toward each of them, so tag rows
--     do not add up to a total.

-- ----------------------------------------------------------------------------
-- breakdown_matches: (entity, transaction) pairs for a dimension and period
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.breakdown_matches (
    p_dimension TEXT,
    p_type public.transaction_type,
    p_start DATE,
    p_end DATE,
    p_group_by_parent BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    entity_id UUID,
    tx_id UUID,
    tx_date DATE,
    amount NUMERIC
) LANGUAGE plpgsql STABLE SECURITY INVOKER
SET
    search_path = '' AS $$
BEGIN
    IF p_dimension IS NULL OR p_dimension NOT IN ('category', 'tag', 'bank_account') THEN
        RAISE EXCEPTION 'breakdown: unknown dimension %', COALESCE(p_dimension, '<null>');
    END IF;

    IF p_dimension = 'category' THEN
        -- Group by parent: a leaf rolls up into its parent; a top-level
        -- category (no parent) stays as itself.
        RETURN QUERY
        SELECT
            CASE WHEN p_group_by_parent THEN COALESCE(c.parent_id, c.id) ELSE tx.category_id END,
            tx.id, tx.date, tx.amount
        FROM public.transactions tx
        LEFT JOIN public.categories c ON c.id = tx.category_id
        WHERE tx.user_id = auth.uid()
          AND tx.deleted_at IS NULL
          AND tx.type = p_type
          AND tx.date BETWEEN p_start AND p_end;
    ELSIF p_dimension = 'tag' THEN
        RETURN QUERY
        SELECT tt.tag_id, tx.id, tx.date, tx.amount
        FROM public.transactions tx
        JOIN public.transaction_tags tt ON tt.transaction_id = tx.id
        WHERE tx.user_id = auth.uid()
          AND tx.deleted_at IS NULL
          AND tx.type = p_type
          AND tx.date BETWEEN p_start AND p_end;
    ELSE
        RETURN QUERY
        SELECT tx.bank_account_id, tx.id, tx.date, tx.amount
        FROM public.transactions tx
        WHERE tx.user_id = auth.uid()
          AND tx.deleted_at IS NULL
          AND tx.type = p_type
          AND tx.date BETWEEN p_start AND p_end;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.breakdown_matches (TEXT, public.transaction_type, DATE, DATE, BOOLEAN) IS 'Internal helper for get_breakdown / get_breakdown_monthly: the (entity, transaction) pairs for a dimension and inclusive period. Owns the matching rules.';

-- ----------------------------------------------------------------------------
-- get_breakdown: ranked list
-- ----------------------------------------------------------------------------
-- member_ids are the category ids a row stands for (the category itself, or in
-- parent mode the parent plus its children), for the transactions-page link.
-- NULL for the Uncategorised / No account rows, which have no id to filter on.
CREATE FUNCTION public.get_breakdown (
    p_dimension TEXT,
    p_type public.transaction_type,
    p_start DATE,
    p_end DATE,
    p_group_by_parent BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    entity_id UUID,
    entity_name TEXT,
    parent_name TEXT,
    member_ids UUID[],
    total NUMERIC,
    tx_count BIGINT
) LANGUAGE sql STABLE SECURITY INVOKER
SET
    search_path = '' AS $$
    WITH agg AS (
        SELECT m.entity_id, SUM(m.amount) AS total, COUNT(*) AS tx_count
        FROM public.breakdown_matches(p_dimension, p_type, p_start, p_end, p_group_by_parent) m
        GROUP BY m.entity_id
    )
    SELECT
        a.entity_id,
        COALESCE(
            cat.name, tg.name, ba.name,
            CASE p_dimension WHEN 'category' THEN 'Uncategorised' WHEN 'bank_account' THEN 'No account' END
        ) AS entity_name,
        CASE WHEN p_dimension = 'category' AND NOT p_group_by_parent THEN par.name END AS parent_name,
        CASE
            WHEN a.entity_id IS NULL THEN NULL
            WHEN p_dimension = 'category' AND p_group_by_parent THEN
                ARRAY[a.entity_id] || COALESCE(
                    (SELECT ARRAY_AGG(ch.id) FROM public.categories ch
                      WHERE ch.parent_id = a.entity_id AND ch.user_id = auth.uid()),
                    ARRAY[]::UUID[])
            ELSE ARRAY[a.entity_id]
        END AS member_ids,
        a.total,
        a.tx_count
    FROM agg a
    LEFT JOIN public.categories cat ON p_dimension = 'category' AND cat.id = a.entity_id
    LEFT JOIN public.categories par ON par.id = cat.parent_id
    LEFT JOIN public.tags tg ON p_dimension = 'tag' AND tg.id = a.entity_id
    LEFT JOIN public.bank_accounts ba ON p_dimension = 'bank_account' AND ba.id = a.entity_id
    ORDER BY a.total DESC, entity_name;
$$;

COMMENT ON FUNCTION public.get_breakdown (TEXT, public.transaction_type, DATE, DATE, BOOLEAN) IS 'Dashboard Breakdown tab: total and transaction count per category/tag/bank account for a type over an inclusive period, ranked by total. Soft-deleted entities still count under their stored name.';

-- ----------------------------------------------------------------------------
-- get_breakdown_monthly: one entity per calendar month
-- ----------------------------------------------------------------------------
-- p_entity_id NULL selects the Uncategorised / No account row.
CREATE FUNCTION public.get_breakdown_monthly (
    p_dimension TEXT,
    p_entity_id UUID,
    p_type public.transaction_type,
    p_start DATE,
    p_end DATE,
    p_group_by_parent BOOLEAN DEFAULT FALSE
) RETURNS TABLE (MONTH DATE, total NUMERIC, tx_count BIGINT) LANGUAGE sql STABLE SECURITY INVOKER
SET
    search_path = '' AS $$
    SELECT
        DATE_TRUNC('month', m.tx_date)::DATE AS month,
        SUM(m.amount) AS total,
        COUNT(*) AS tx_count
    FROM public.breakdown_matches(p_dimension, p_type, p_start, p_end, p_group_by_parent) m
    WHERE m.entity_id IS NOT DISTINCT FROM p_entity_id
    GROUP BY 1
    ORDER BY 1;
$$;

COMMENT ON FUNCTION public.get_breakdown_monthly (TEXT, UUID, public.transaction_type, DATE, DATE, BOOLEAN) IS 'Dashboard Breakdown tab: one entity''s total and transaction count per calendar month (only months that have transactions), using the same matching rules as get_breakdown.';

-- ----------------------------------------------------------------------------
-- Grants: signed-in users only (anon has no auth.uid(), so nothing to return)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.breakdown_matches (TEXT, public.transaction_type, DATE, DATE, BOOLEAN)
FROM
    PUBLIC,
    anon;

REVOKE ALL ON FUNCTION public.get_breakdown (TEXT, public.transaction_type, DATE, DATE, BOOLEAN)
FROM
    PUBLIC,
    anon;

REVOKE ALL ON FUNCTION public.get_breakdown_monthly (TEXT, UUID, public.transaction_type, DATE, DATE, BOOLEAN)
FROM
    PUBLIC,
    anon;

GRANT
EXECUTE ON FUNCTION public.breakdown_matches (TEXT, public.transaction_type, DATE, DATE, BOOLEAN) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_breakdown (TEXT, public.transaction_type, DATE, DATE, BOOLEAN) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_breakdown_monthly (TEXT, UUID, public.transaction_type, DATE, DATE, BOOLEAN) TO authenticated;

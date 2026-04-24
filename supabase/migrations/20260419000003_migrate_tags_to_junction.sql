-- ============================================================================
-- Migration: migrate_tags_to_junction
-- Purpose:   Resolve dual tag storage inconsistency.
--
--   The transactions table has a legacy `tags TEXT[]` column AND a normalised
--   `transaction_tags` junction table.  Before this migration two views used
--   different sources:
--     • tags_with_usage          → UNNEST(transactions.tags)  (legacy)
--     • view_monthly_tagged_*    → transaction_tags            (canonical)
--
--   This migration:
--     1. Back-fills transaction_tags from any legacy transactions.tags rows
--        that were written via the old code path.
--     2. Replaces tags_with_usage to count from transaction_tags exclusively.
--     3. Deprecates the transactions.tags column via a COMMENT.
--
--   Note: delete_tag_safe was already updated to use transaction_tags in
--   20260227201422_add_soft_delete.sql — no changes needed there.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Back-fill transaction_tags from legacy transactions.tags text array
-- ----------------------------------------------------------------------------
-- Migrate legacy tags text array data into transaction_tags junction table.
-- Handles any transactions inserted via legacy code path that wrote to
-- transactions.tags[] but not transaction_tags.
INSERT INTO public.transaction_tags (transaction_id, tag_id)
SELECT DISTINCT t.id AS transaction_id, tg.id AS tag_id
FROM public.transactions t
CROSS JOIN LATERAL UNNEST(t.tags) AS tag_name
JOIN public.tags tg ON tg.name = tag_name
                   AND tg.user_id = t.user_id
                   AND tg.deleted_at IS NULL
WHERE t.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Replace tags_with_usage to count via transaction_tags (canonical source)
-- ----------------------------------------------------------------------------
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
        tt.tag_id,
        COUNT(DISTINCT tt.transaction_id)::BIGINT AS cnt
    FROM public.transaction_tags tt
    JOIN public.transactions t ON t.id = tt.transaction_id
                               AND t.deleted_at IS NULL
    GROUP BY tt.tag_id
) u ON u.tag_id = g.id
WHERE g.deleted_at IS NULL;

COMMENT ON VIEW public.tags_with_usage IS 'Per-user tags with reference counts from non-deleted transactions via transaction_tags junction table (in_use_count).';

-- ----------------------------------------------------------------------------
-- 3. Deprecate the legacy transactions.tags column
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.transactions.tags IS
    'DEPRECATED: Legacy tag storage as text array. Canonical tag data is in transaction_tags junction table. This column will be dropped in a future migration once fully migrated.';

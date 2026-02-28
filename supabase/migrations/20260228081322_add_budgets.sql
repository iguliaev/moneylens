-- ============================================================================
-- Migration: 20260228081322_add_budgets.sql
-- Purpose: Add Budgets feature — lets users define spending/savings targets
--          linked to categories and/or tags, with progress tracked automatically.
-- ============================================================================
-- ============================================================================
-- 1. budgets table
-- ============================================================================
CREATE TABLE IF NOT EXISTS
    public.budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        NAME TEXT NOT NULL,
        description TEXT,
        TYPE transaction_type NOT NULL,
        target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
        start_date DATE,
        end_date DATE,
        deleted_at TIMESTAMPTZ DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (
            start_date IS NULL
            OR end_date IS NULL
            OR start_date <= end_date
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_user_name_active
    ON public.budgets (user_id, name)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_user ON public.budgets (user_id);

CREATE INDEX IF NOT EXISTS idx_budgets_user_deleted ON public.budgets (user_id, deleted_at);

COMMENT ON TABLE public.budgets IS 'User-defined budgets tracking spending or savings targets.';

-- updated_at trigger
DROP TRIGGER IF EXISTS tg_budgets_updated_at ON public.budgets;

CREATE TRIGGER tg_budgets_updated_at BEFORE
UPDATE ON public.budgets FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at ();

-- user_id trigger
DROP TRIGGER IF EXISTS tg_budgets_user_id ON public.budgets;

CREATE TRIGGER tg_budgets_user_id BEFORE INSERT ON public.budgets FOR EACH ROW
EXECUTE FUNCTION public.tg_set_user_id ();

-- ============================================================================
-- 2. budget_categories junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS
    public.budget_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        budget_id UUID NOT NULL REFERENCES public.budgets (id) ON DELETE CASCADE,
        category_id UUID NOT NULL REFERENCES public.categories (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_budget_category UNIQUE (budget_id, category_id)
    );

CREATE INDEX IF NOT EXISTS idx_budget_categories_budget ON public.budget_categories (budget_id);

CREATE INDEX IF NOT EXISTS idx_budget_categories_category ON public.budget_categories (category_id);

COMMENT ON TABLE public.budget_categories IS 'Categories linked to a budget for progress tracking.';

-- ============================================================================
-- 3. budget_tags junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS
    public.budget_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        budget_id UUID NOT NULL REFERENCES public.budgets (id) ON DELETE CASCADE,
        tag_id UUID NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_budget_tag UNIQUE (budget_id, tag_id)
    );

CREATE INDEX IF NOT EXISTS idx_budget_tags_budget ON public.budget_tags (budget_id);

CREATE INDEX IF NOT EXISTS idx_budget_tags_tag ON public.budget_tags (tag_id);

COMMENT ON TABLE public.budget_tags IS 'Tags linked to a budget for progress tracking.';

-- ============================================================================
-- 4. Row Level Security
-- ============================================================================
-- budgets RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budgets_select ON public.budgets;

CREATE POLICY budgets_select ON public.budgets FOR
SELECT
    USING (
        user_id = (
            SELECT
                auth.uid ()
        )
    );

DROP POLICY IF EXISTS budgets_insert ON public.budgets;

CREATE POLICY budgets_insert ON public.budgets FOR INSERT
WITH
    CHECK (
        user_id = (
            SELECT
                auth.uid ()
        )
    );

DROP POLICY IF EXISTS budgets_update ON public.budgets;

CREATE POLICY budgets_update ON public.budgets FOR
UPDATE USING (
    user_id = (
        SELECT
            auth.uid ()
    )
)
WITH CHECK (
    user_id = (
        SELECT
            auth.uid ()
    )
);

DROP POLICY IF EXISTS budgets_delete ON public.budgets;

CREATE POLICY budgets_delete ON public.budgets FOR DELETE USING (
    user_id = (
        SELECT
            auth.uid ()
    )
);

-- budget_categories RLS (scoped via budget ownership)
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_categories_select ON public.budget_categories;

CREATE POLICY budget_categories_select ON public.budget_categories FOR
SELECT
    USING (
        EXISTS (
            SELECT
                1
            FROM
                public.budgets b
            WHERE
                b.id = budget_id
                AND b.user_id = (
                    SELECT
                        auth.uid ()
                )
        )
    );

DROP POLICY IF EXISTS budget_categories_insert ON public.budget_categories;

CREATE POLICY budget_categories_insert ON public.budget_categories FOR INSERT
WITH
    CHECK (
        EXISTS (
            SELECT
                1
            FROM
                public.budgets b
            WHERE
                b.id = budget_id
                AND b.user_id = (
                    SELECT
                        auth.uid ()
                )
        )
        AND EXISTS (
            SELECT
                1
            FROM
                public.categories c
            WHERE
                c.id = category_id
                AND c.user_id = (
                    SELECT
                        auth.uid ()
                )
                AND c.deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS budget_categories_delete ON public.budget_categories;

CREATE POLICY budget_categories_delete ON public.budget_categories FOR DELETE USING (
    EXISTS (
        SELECT
            1
        FROM
            public.budgets b
        WHERE
            b.id = budget_id
            AND b.user_id = (
                SELECT
                    auth.uid ()
            )
    )
);

-- budget_tags RLS (scoped via budget ownership)
ALTER TABLE public.budget_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_tags_select ON public.budget_tags;

CREATE POLICY budget_tags_select ON public.budget_tags FOR
SELECT
    USING (
        EXISTS (
            SELECT
                1
            FROM
                public.budgets b
            WHERE
                b.id = budget_id
                AND b.user_id = (
                    SELECT
                        auth.uid ()
                )
        )
    );

DROP POLICY IF EXISTS budget_tags_insert ON public.budget_tags;

CREATE POLICY budget_tags_insert ON public.budget_tags FOR INSERT
WITH
    CHECK (
        EXISTS (
            SELECT
                1
            FROM
                public.budgets b
            WHERE
                b.id = budget_id
                AND b.user_id = (
                    SELECT
                        auth.uid ()
                )
        )
        AND EXISTS (
            SELECT
                1
            FROM
                public.tags t
            WHERE
                t.id = tag_id
                AND t.user_id = (
                    SELECT
                        auth.uid ()
                )
                AND t.deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS budget_tags_delete ON public.budget_tags;

CREATE POLICY budget_tags_delete ON public.budget_tags FOR DELETE USING (
    EXISTS (
        SELECT
            1
        FROM
            public.budgets b
        WHERE
            b.id = budget_id
            AND b.user_id = (
                SELECT
                    auth.uid ()
            )
    )
);

-- ============================================================================
-- 5. get_budget_progress() RPC
--    Returns all non-deleted budgets for the current user with current_amount.
--    A transaction contributes if its category_id matches any linked category
--    OR any of its tags (via transaction_tags) match any linked tag.
--    DISTINCT on transaction id prevents double-counting.
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
        -- transactions matched via a linked category (non-deleted categories only)
        SELECT bc.budget_id, tx.id AS tx_id, tx.amount
        FROM public.budgets b
        JOIN public.budget_categories bc ON bc.budget_id = b.id
        JOIN public.categories cat ON cat.id = bc.category_id
                                   AND cat.deleted_at IS NULL
        JOIN public.transactions tx
            ON  tx.category_id  = bc.category_id
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

GRANT EXECUTE ON FUNCTION public.get_budget_progress () TO authenticated;

-- ============================================================================
-- 6. budgets_with_linked view (for list page — shows category/tag counts)
-- ============================================================================
CREATE OR REPLACE VIEW
    public.budgets_with_linked
WITH
    (security_invoker = TRUE) AS
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
    (
        SELECT
            COUNT(*)
        FROM
            public.budget_categories bc
            JOIN public.categories c ON c.id = bc.category_id
        WHERE
            bc.budget_id = b.id
            AND c.deleted_at IS NULL
    ) AS category_count,
    (
        SELECT
            COUNT(*)
        FROM
            public.budget_tags bt
            JOIN public.tags t ON t.id = bt.tag_id
        WHERE
            bt.budget_id = b.id
            AND t.deleted_at IS NULL
    ) AS tag_count
FROM
    public.budgets b
WHERE
    b.deleted_at IS NULL;
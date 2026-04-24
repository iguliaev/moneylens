-- ============================================================================
-- Migration: 20260419000000_add_transaction_date_indexes.sql
-- Purpose: Add composite indexes on transactions(user_id, date) to speed up
--          date-range analytics queries used by all dashboard views.
-- ============================================================================

-- Composite index for common analytics access pattern:
-- filter by user + soft-delete, order/range by date
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON public.transactions (user_id, date DESC)
    WHERE deleted_at IS NULL;

-- Separate composite for type-filtered queries (view_monthly_totals, etc.)
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
    ON public.transactions (user_id, type, date DESC)
    WHERE deleted_at IS NULL;

-- Document nullable date semantics on budgets
COMMENT ON COLUMN public.budgets.start_date IS
    'Inclusive start date for budget progress tracking. NULL means open-ended (no lower bound). When implementing recurring budgets, derive from a period enum column.';

COMMENT ON COLUMN public.budgets.end_date IS
    'Inclusive end date for budget progress tracking. NULL means open-ended (no upper bound). When implementing recurring budgets, derive from a period enum column.';

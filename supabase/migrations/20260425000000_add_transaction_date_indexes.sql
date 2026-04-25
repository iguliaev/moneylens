-- Composite index covering the most common analytics access pattern:
-- filter by user + soft-delete, order/range by date
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON public.transactions (user_id, date DESC)
    WHERE deleted_at IS NULL;

-- Separate composite for type-filtered queries (view_monthly_totals, etc.)
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
    ON public.transactions (user_id, type, date DESC)
    WHERE deleted_at IS NULL;

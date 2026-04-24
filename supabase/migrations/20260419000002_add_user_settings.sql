-- ============================================================================
-- Migration: 20260419000002_add_user_settings.sql
-- Purpose: Add user_settings table to persist per-user preferences
--          (starting with currency) server-side for cross-device sync.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    currency   TEXT NOT NULL DEFAULT 'GBP'
                     CHECK (char_length(currency) = 3),  -- ISO 4217
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_settings IS 'Per-user application preferences persisted server-side for cross-device sync.';
COMMENT ON COLUMN public.user_settings.currency IS 'ISO 4217 three-letter currency code (e.g. GBP, USD, EUR).';

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON public.user_settings
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_settings_insert ON public.user_settings
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_settings_update ON public.user_settings
    FOR UPDATE USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS tg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER tg_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

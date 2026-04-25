CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    currency   TEXT NOT NULL DEFAULT 'GBP'
                    CHECK (char_length(currency) = 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select ON public.user_settings;
CREATE POLICY user_settings_select ON public.user_settings
    FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_settings_insert ON public.user_settings;
CREATE POLICY user_settings_insert ON public.user_settings
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_settings_update ON public.user_settings;
CREATE POLICY user_settings_update ON public.user_settings
    FOR UPDATE USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Auto-set user_id on insert (follows same pattern as categories, tags, etc.)
DROP TRIGGER IF EXISTS tg_user_settings_user_id ON public.user_settings;
CREATE TRIGGER tg_user_settings_user_id
    BEFORE INSERT ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_user_id();

-- Auto-update updated_at on update
DROP TRIGGER IF EXISTS tg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER tg_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

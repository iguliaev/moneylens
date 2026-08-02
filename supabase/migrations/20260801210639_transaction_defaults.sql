-- Per-transaction-type entry defaults.
--
-- Lets a user nominate, for each transaction type, the category and bank account
-- that the Create form should pre-fill, plus an overall default type so a Create
-- form reached without a ?type= param still opens fully populated.
--
-- These are user *preferences*, so they live alongside user_settings rather than
-- as flags on categories/bank_accounts — that keeps the bulk-upload, export and
-- reset payload shapes untouched.

-- === Default transaction type =============================================
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS default_transaction_type public.transaction_type;

COMMENT ON COLUMN public.user_settings.default_transaction_type IS
  'Transaction type pre-selected on the Create form when no type is supplied via the URL. NULL means no default.';

-- === Per-type category / bank account defaults ============================
CREATE TABLE IF NOT EXISTS public.user_transaction_defaults (
    user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    type            public.transaction_type NOT NULL,
    -- ON DELETE SET NULL only covers hard deletes; categories and bank_accounts
    -- are soft-deleted in this app, so readers must additionally ignore rows
    -- pointing at a deleted_at IS NOT NULL target. The validation trigger below
    -- stops a soft-deleted row from ever being *stored* as a default.
    category_id     UUID REFERENCES public.categories (id) ON DELETE SET NULL,
    bank_account_id UUID REFERENCES public.bank_accounts (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, type)
);

COMMENT ON TABLE public.user_transaction_defaults IS
  'Per-transaction-type default category and bank account used to pre-fill the transaction Create form. At most one row per (user, type).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_transaction_defaults
  TO anon, authenticated, service_role;

ALTER TABLE public.user_transaction_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_transaction_defaults_select ON public.user_transaction_defaults;
CREATE POLICY user_transaction_defaults_select ON public.user_transaction_defaults
    FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_transaction_defaults_insert ON public.user_transaction_defaults;
CREATE POLICY user_transaction_defaults_insert ON public.user_transaction_defaults
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_transaction_defaults_update ON public.user_transaction_defaults;
CREATE POLICY user_transaction_defaults_update ON public.user_transaction_defaults
    FOR UPDATE USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_transaction_defaults_delete ON public.user_transaction_defaults;
CREATE POLICY user_transaction_defaults_delete ON public.user_transaction_defaults
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Referential validation. The foreign keys above guarantee the rows exist, but
-- not that they belong to this user, that the category's type matches, or that
-- either is still live. Compares against NEW.user_id rather than auth.uid() so
-- the check also holds if a SECURITY DEFINER path ever writes this table.
CREATE
OR REPLACE FUNCTION public.validate_user_transaction_defaults_refs () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
begin
  if new.category_id is not null then
    if not exists (
      select 1 from public.categories c
      where c.id = new.category_id
        and c.user_id = new.user_id
        and c.type = new.type
        and c.deleted_at is null
    ) then
      raise exception 'Default category must be a live category of the same type owned by the user' using errcode = '23514';
    end if;
  end if;

  if new.bank_account_id is not null then
    if not exists (
      select 1 from public.bank_accounts b
      where b.id = new.bank_account_id
        and b.user_id = new.user_id
        and b.deleted_at is null
    ) then
      raise exception 'Default bank account does not belong to the user' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS set_user_id_on_user_transaction_defaults ON public.user_transaction_defaults;
CREATE TRIGGER set_user_id_on_user_transaction_defaults
    BEFORE INSERT ON public.user_transaction_defaults
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_user_id ();

DROP TRIGGER IF EXISTS set_updated_at_on_user_transaction_defaults ON public.user_transaction_defaults;
CREATE TRIGGER set_updated_at_on_user_transaction_defaults
    BEFORE UPDATE ON public.user_transaction_defaults
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at ();

-- NOTE: Postgres fires BEFORE triggers of the same timing in *alphabetical* order.
-- This one must sort after set_user_id_on_user_transaction_defaults, or it would
-- validate against a NULL NEW.user_id on insert. "validate_" > "set_" — do not
-- rename this to check_* without re-checking that ordering.
DROP TRIGGER IF EXISTS validate_user_transaction_defaults_refs ON public.user_transaction_defaults;
CREATE TRIGGER validate_user_transaction_defaults_refs
    BEFORE INSERT OR UPDATE ON public.user_transaction_defaults
    FOR EACH ROW EXECUTE FUNCTION public.validate_user_transaction_defaults_refs ();

-- === Keep Reset All Data honest ===========================================
-- reset_user_data hard-deletes categories and bank_accounts, so the FKs above
-- would leave defaults rows behind with NULLed-out columns. Clear them outright,
-- along with the default type, so a reset user starts from a clean slate.
-- Return shape is deliberately unchanged — the Settings UI renders it verbatim.
CREATE
OR REPLACE FUNCTION public.reset_user_data () RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_uid uuid;
  v_transactions_deleted bigint := 0;
  v_categories_deleted bigint := 0;
  v_tags_deleted bigint := 0;
  v_bank_accounts_deleted bigint := 0;
  v_budgets_deleted bigint := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'reset_user_data: not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Entry defaults go first: they reference categories and bank_accounts, and
  -- they are preferences rather than data, so they are not counted in the result.
  DELETE FROM public.user_transaction_defaults WHERE user_id = v_uid;

  UPDATE public.user_settings
     SET default_transaction_type = NULL
   WHERE user_id = v_uid
     AND default_transaction_type IS NOT NULL;

  -- Delete in FK-safe order. Budgets go first so their linked rows cascade away
  -- before categories/tags are removed.
  DELETE FROM public.budgets WHERE user_id = v_uid;
  GET DIAGNOSTICS v_budgets_deleted = ROW_COUNT;

  DELETE FROM public.transactions WHERE user_id = v_uid;
  GET DIAGNOSTICS v_transactions_deleted = ROW_COUNT;

  DELETE FROM public.categories WHERE user_id = v_uid;
  GET DIAGNOSTICS v_categories_deleted = ROW_COUNT;

  DELETE FROM public.tags WHERE user_id = v_uid;
  GET DIAGNOSTICS v_tags_deleted = ROW_COUNT;

  DELETE FROM public.bank_accounts WHERE user_id = v_uid;
  GET DIAGNOSTICS v_bank_accounts_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'budgets_deleted', v_budgets_deleted,
    'transactions_deleted', v_transactions_deleted,
    'categories_deleted', v_categories_deleted,
    'tags_deleted', v_tags_deleted,
    'bank_accounts_deleted', v_bank_accounts_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.reset_user_data () IS 'Permanently deletes all personal financial data for the authenticated user, including:
- All budgets (and their linked budget categories/tags)
- All transactions
- All categories
- All tags
- All bank accounts
It also clears the user''s transaction entry defaults (per-type category/bank account and default type), which reference the deleted rows. Those are not included in the returned counts.';

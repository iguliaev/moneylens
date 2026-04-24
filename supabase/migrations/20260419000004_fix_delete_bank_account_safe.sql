-- Fix delete_bank_account_safe: use RETURN NEXT before RETURN so that the
-- set-returning function actually emits a row instead of returning empty.
CREATE OR REPLACE FUNCTION public.delete_bank_account_safe (p_bank_account_id UUID)
RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts b
    WHERE b.id = p_bank_account_id AND b.user_id = v_uid AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
  END IF;

  -- Count references from non-deleted transactions
  SELECT COUNT(*) INTO in_use_count
  FROM public.transactions t
  WHERE t.bank_account_id = p_bank_account_id
    AND t.user_id = v_uid
    AND t.deleted_at IS NULL;

  IF in_use_count > 0 THEN
    ok := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Soft delete
  UPDATE public.bank_accounts
  SET deleted_at = NOW()
  WHERE id = p_bank_account_id AND user_id = v_uid;

  ok := true;
  in_use_count := 0;
  RETURN NEXT;
  RETURN;
END;
$$;

-- Trigger function: when transactions.tags[] is written (legacy path),
-- sync the data into transaction_tags junction table.
CREATE OR REPLACE FUNCTION public.tg_sync_legacy_tags()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW.tags IS NOT NULL AND array_length(NEW.tags, 1) > 0 THEN
        INSERT INTO public.transaction_tags (transaction_id, tag_id)
        SELECT NEW.id, tg.id
        FROM unnest(NEW.tags) AS t(name)
        JOIN public.tags tg
          ON tg.name = t.name
         AND tg.user_id = NEW.user_id
         AND tg.deleted_at IS NULL
        ON CONFLICT (transaction_id, tag_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_legacy_tags ON public.transactions;

CREATE TRIGGER tg_sync_legacy_tags
    AFTER INSERT OR UPDATE OF tags ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_sync_legacy_tags();

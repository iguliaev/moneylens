-- Fix delete_bank_account_safe and delete_tag_safe: bare RETURN in a RETURNS TABLE
-- function exits without emitting a row. Replace with RETURN NEXT to actually
-- output the result row before exiting.

CREATE OR REPLACE FUNCTION public.delete_bank_account_safe(p_bank_account_id uuid)
  RETURNS TABLE(ok boolean, in_use_count bigint)
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

  UPDATE public.bank_accounts
  SET deleted_at = NOW()
  WHERE id = p_bank_account_id AND user_id = v_uid;

  ok := true;
  in_use_count := 0;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tag_safe(p_tag_id uuid)
  RETURNS TABLE(ok boolean, in_use_count bigint)
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
    SELECT 1 FROM public.tags g
    WHERE g.id = p_tag_id AND g.user_id = v_uid AND g.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO in_use_count
  FROM public.transaction_tags tt
  JOIN public.transactions t ON tt.transaction_id = t.id
  WHERE tt.tag_id = p_tag_id
    AND t.user_id = v_uid
    AND t.deleted_at IS NULL;

  IF in_use_count > 0 THEN
    ok := false;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.tags
  SET deleted_at = NOW()
  WHERE id = p_tag_id AND user_id = v_uid;

  ok := true;
  in_use_count := 0;
  RETURN NEXT;
END;
$$;

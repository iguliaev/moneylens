-- supabase/migrations/20260726090000_fix_update_transaction_with_tags_zero_row_update.sql
--
-- update_transaction_with_tags's UPDATE didn't repeat the deleted_at IS NULL
-- filter used by its preceding ownership check, and never checked whether
-- the UPDATE actually matched a row. Under a TOCTOU race (e.g. a concurrent
-- soft-delete between the ownership check and the UPDATE), the UPDATE would
-- silently match zero rows, leaving v_transaction as an all-NULL composite
-- that gets RETURNed as if the save had succeeded.

CREATE OR REPLACE FUNCTION public.update_transaction_with_tags(
  p_transaction_id uuid,
  p_transaction    jsonb,
  p_tag_ids        uuid[]
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction public.transactions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE id = p_transaction_id AND user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Transaction not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate category ownership (must be non-deleted)
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = (p_transaction->>'category_id')::uuid AND user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Category not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate bank account ownership (must be non-deleted)
  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts
    WHERE id = (p_transaction->>'bank_account_id')::uuid AND user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bank account not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate all tags belong to current user (must be non-deleted)
  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_tag_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags WHERE id = tid AND user_id = auth.uid() AND deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'One or more tags not found or access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.transactions SET
    date            = (p_transaction->>'date')::date,
    type            = (p_transaction->>'type')::public.transaction_type,
    amount          = (p_transaction->>'amount')::numeric,
    category_id     = (p_transaction->>'category_id')::uuid,
    bank_account_id = (p_transaction->>'bank_account_id')::uuid,
    notes           = p_transaction->>'notes'
  WHERE id = p_transaction_id AND user_id = auth.uid() AND deleted_at IS NULL
  RETURNING * INTO v_transaction;

  -- Guards against the TOCTOU race described above.
  IF v_transaction.id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Replace all tag associations atomically
  DELETE FROM public.transaction_tags WHERE transaction_id = p_transaction_id;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    SELECT p_transaction_id, unnest(p_tag_ids)
    ON CONFLICT (transaction_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_transaction;
END;
$$;

COMMENT ON FUNCTION public.update_transaction_with_tags IS
  'Atomically updates a transaction and replaces all tag associations in one DB transaction.';

GRANT EXECUTE ON FUNCTION public.update_transaction_with_tags(uuid, jsonb, uuid[]) TO authenticated;

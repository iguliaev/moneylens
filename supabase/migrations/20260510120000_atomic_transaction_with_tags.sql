-- supabase/migrations/20260510120000_atomic_transaction_with_tags.sql

-- ============================================================
-- create_transaction_with_tags
-- Inserts a transaction and associates tags in one DB transaction.
-- Atomicity: if tag insertion fails (e.g. invalid FK), the whole operation rolls back.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_transaction_with_tags(
  p_transaction jsonb,
  p_tag_ids     uuid[]
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction public.transactions;
BEGIN
  -- Validate category ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = (p_transaction->>'category_id')::uuid AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Category not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate bank account ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts
    WHERE id = (p_transaction->>'bank_account_id')::uuid AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bank account not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate all tags belong to current user
  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_tag_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags WHERE id = tid AND user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'One or more tags not found or access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- tg_set_user_id trigger will set user_id = auth.uid() on INSERT
  INSERT INTO public.transactions (
    date, type, amount, category_id, bank_account_id, notes
  ) VALUES (
    (p_transaction->>'date')::date,
    (p_transaction->>'type')::public.transaction_type,
    (p_transaction->>'amount')::numeric,
    (p_transaction->>'category_id')::uuid,
    (p_transaction->>'bank_account_id')::uuid,
    p_transaction->>'notes'
  )
  RETURNING * INTO v_transaction;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    SELECT v_transaction.id, unnest(p_tag_ids)
    ON CONFLICT (transaction_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_transaction;
END;
$$;

COMMENT ON FUNCTION public.create_transaction_with_tags IS
  'Atomically creates a transaction and sets its tag associations in one DB transaction.';

GRANT EXECUTE ON FUNCTION public.create_transaction_with_tags(jsonb, uuid[]) TO authenticated;

-- ============================================================
-- update_transaction_with_tags
-- Updates a transaction and replaces all tag associations atomically.
-- Raises 42501 if the caller does not own p_transaction_id.
-- ============================================================
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
    WHERE id = p_transaction_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Transaction not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate category ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = (p_transaction->>'category_id')::uuid AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Category not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate bank account ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts
    WHERE id = (p_transaction->>'bank_account_id')::uuid AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bank account not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Validate all tags belong to current user
  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_tag_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags WHERE id = tid AND user_id = auth.uid()
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
  WHERE id = p_transaction_id AND user_id = auth.uid()
  RETURNING * INTO v_transaction;

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

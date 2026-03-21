-- Update reset_user_data() so Reset All Data also removes user-created budgets.
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
- All bank accounts';

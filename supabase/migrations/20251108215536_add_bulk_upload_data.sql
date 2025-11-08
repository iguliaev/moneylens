set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.bulk_upload_data(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_categories_inserted int := 0;
  v_bank_accounts_inserted int := 0;
  v_tags_inserted int := 0;
  v_transactions_inserted int := 0;
  v_tx_result jsonb;
BEGIN
  -- Authenticate caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'bulk_upload_data: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Categories (if provided)
  IF p_payload ? 'categories' AND p_payload->'categories' IS NOT NULL THEN
    v_categories_inserted := public.insert_categories(v_user_id, p_payload->'categories');
  END IF;

  -- Bank accounts (if provided)
  IF p_payload ? 'bank_accounts' AND p_payload->'bank_accounts' IS NOT NULL THEN
    v_bank_accounts_inserted := public.insert_bank_accounts(v_user_id, p_payload->'bank_accounts');
  END IF;

  -- Tags (if provided)
  IF p_payload ? 'tags' AND p_payload->'tags' IS NOT NULL THEN
    v_tags_inserted := public.insert_tags(v_user_id, p_payload->'tags');
  END IF;

  -- Transactions (if provided) - delegate to existing bulk_insert_transactions
  IF p_payload ? 'transactions' AND p_payload->'transactions' IS NOT NULL THEN
    -- bulk_insert_transactions is SECURITY DEFINER and will itself authenticate using auth.uid()
    v_tx_result := public.bulk_insert_transactions(p_payload->'transactions');
    -- Extract inserted_count if present
    IF v_tx_result IS NOT NULL AND v_tx_result ? 'inserted_count' THEN
      v_transactions_inserted := (v_tx_result->>'inserted_count')::int;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'categories_inserted', v_categories_inserted,
    'bank_accounts_inserted', v_bank_accounts_inserted,
    'tags_inserted', v_tags_inserted,
    'transactions_inserted', v_transactions_inserted
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    -- validation exceptions raised by helpers - preserve them
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'bulk_upload_data failed: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_bank_accounts(p_user_id uuid, p_bank_accounts jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_missing_count int;
  v_inserted_count int := 0;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_bank_accounts: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_bank_accounts: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_bank_accounts IS NULL OR jsonb_array_length(p_bank_accounts) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required field: name must be present for every element
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_bank_accounts) AS elem
  WHERE (elem->>'name') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_bank_accounts: one or more items are missing required field "name"';
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.bank_accounts (user_id, name, description)
  SELECT
    p_user_id,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_bank_accounts) AS elem
  ON CONFLICT (user_id, name) DO NOTHING;
  
  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_bank_accounts failed: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_categories(p_user_id uuid, p_categories jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_inserted_count int := 0;
BEGIN
  -- Authorization: ensure the caller is authenticated and may act for p_user_id.
  -- Prefer explicit check rather than allowing arbitrary p_user_id values.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_categories: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_categories: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_categories IS NULL OR jsonb_array_length(p_categories) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required fields: every element must have name and type
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_categories) AS elem
  WHERE (elem->>'name') IS NULL OR (elem->>'type') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_categories: one or more items are missing required fields "name" or "type"';
  END IF;

  -- Validate that provided type values are members of transaction_type enum
  WITH types AS (
    SELECT DISTINCT (elem->>'type') AS typ
    FROM jsonb_array_elements(p_categories) AS elem
  ), invalid AS (
    SELECT typ
    FROM types
    WHERE typ NOT IN (
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = 'public.transaction_type'::regtype
    )
  )
  SELECT typ INTO v_invalid_type FROM invalid LIMIT 1;

  IF v_invalid_type IS NOT NULL THEN
    RAISE EXCEPTION 'insert_categories: invalid transaction_type: %', v_invalid_type;
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.categories (user_id, type, name, description)
  SELECT
    p_user_id,
    (elem->>'type')::public.transaction_type,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_categories) AS elem
  ON CONFLICT (user_id, type, name) DO NOTHING;
  
  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  -- Re-raise validation/user-raised errors so their original message and SQLSTATE
  -- are preserved (RAISE EXCEPTION produces SQLSTATE 'P0001').
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    -- Wrap unexpected errors to give a clear function-level context.
    RAISE EXCEPTION 'insert_categories failed: %', SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_tags(p_user_id uuid, p_tags jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_missing_count int;
  v_inserted_count int := 0;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_tags: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_tags: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_tags IS NULL OR jsonb_array_length(p_tags) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required field: name must be present for every element
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_tags) AS elem
  WHERE (elem->>'name') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_tags: one or more items are missing required field "name"';
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.tags (user_id, name, description)
  SELECT
    p_user_id,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_tags) AS elem
  ON CONFLICT (user_id, name) DO NOTHING;
  
  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_tags failed: %', SQLERRM;
END;
$function$
;



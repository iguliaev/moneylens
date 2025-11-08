set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.insert_bank_accounts(p_user_id uuid, p_bank_accounts jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_missing_count int;
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
    RETURN;
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

  RETURN;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_bank_accounts failed: %', SQLERRM;
END;
$function$
;



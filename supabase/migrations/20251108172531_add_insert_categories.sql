set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.insert_categories(p_user_id uuid, p_categories jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_missing_count int;
  v_invalid_type text;
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
    RETURN;
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

  RETURN;
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



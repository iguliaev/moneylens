-- Replace the old unique constraint that prevented same-named categories under
-- different parents. The new constraint allows e.g. Food/Groceries and
-- Vacations/Groceries to coexist, while still preventing two root-level
-- categories (or two siblings under the same parent) from having the same name.
--
-- NULLS NOT DISTINCT: treats NULL parent_id as equal for uniqueness purposes,
-- so two root categories (parent_id IS NULL) with the same name are still rejected.

ALTER TABLE categories
  DROP CONSTRAINT unique_user_type_name;

ALTER TABLE categories
  ADD CONSTRAINT unique_user_type_name UNIQUE NULLS NOT DISTINCT (
    user_id,
    type,
    name,
    parent_id
  );

-- Update insert_categories to use ON CONFLICT ON CONSTRAINT (now includes parent_id).
-- Root-level inserts (parent_id IS NULL) still deduplicate correctly because
-- the constraint uses NULLS NOT DISTINCT.
CREATE OR REPLACE FUNCTION insert_categories (p_user_id UUID, p_categories jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_inserted_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_categories: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_categories: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  IF p_categories IS NULL OR jsonb_array_length(p_categories) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_categories) AS elem
  WHERE (elem->>'name') IS NULL OR (elem->>'type') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_categories: one or more items are missing required fields "name" or "type"';
  END IF;

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

  INSERT INTO public.categories (user_id, type, name, description)
  SELECT
    p_user_id,
    (elem->>'type')::public.transaction_type,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_categories) AS elem
  ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_categories failed: %', SQLERRM;
END;
$$;

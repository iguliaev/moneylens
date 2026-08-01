-- Let insert_categories create nested categories on demand via a new
-- optional "parent" field, instead of only ever inserting root-level rows.
--
-- Previously, a `categories` payload entry like
--   { "type": "spend", "name": "Eating out" }
-- could only ever create a root-level category. A transaction referencing a
-- "Parent/Child" category path (bulk_insert_transactions,
-- 20260729212856_bulk_insert_hierarchical_category_path.sql) therefore
-- required BOTH the parent and the child to already exist beforehand — flagged
-- as a "Known limitation" when JSON export shipped
-- (docs/superpowers/plans/2026-07-29-json-export-and-leaf-category-fix.md).
--
-- New convention: a category entry may carry a `parent` field holding the
-- bare parent category name (same `type`), e.g.
--   { "type": "spend", "name": "Eating out", "parent": "Food" }
-- `name` stays a plain leaf name — this is a different, additional
-- convention from the "Parent/Child" path string already used by a
-- transaction's own `category` field, which is unaffected.
--
-- Resolution rule (two phases, since a child's parent_id must reference an
-- already-existing row):
--   1. Root categories: explicit entries with no `parent`, plus every
--      distinct `parent` name referenced by a nested entry that doesn't
--      already exist as a root category — auto-vivified with a NULL
--      description. If a name appears both as an explicit root entry (with
--      its own description) and as an auto-derived parent, the explicit
--      entry wins.
--   2. Nested categories: for each entry with a non-empty `parent`, resolve
--      parent_id against that user's root-level (parent_id IS NULL) category
--      of the same type and name (guaranteed to exist after phase 1), then
--      insert the child under it.
--
-- The schema caps hierarchy at 2 levels (trg_validate_category_parent,
-- 20260601210000_add_category_hierarchy.sql). A batch where some name is
-- both referenced as a `parent` by one entry AND itself carries a non-empty
-- `parent` (an attempted 3-level chain) is rejected up front, rather than
-- silently creating a confusing duplicate root.

CREATE OR REPLACE FUNCTION insert_categories (p_user_id UUID, p_categories jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_conflict_name text;
  v_root_inserted int := 0;
  v_child_inserted int := 0;
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

  -- A name cannot be both a parent (referenced via another element's
  -- "parent") and itself a child (has its own non-empty "parent") in the
  -- same batch — the schema caps hierarchy at 2 levels.
  SELECT p.name INTO v_conflict_name
  FROM (
    SELECT DISTINCT (elem->>'type') AS typ, trim(elem->>'parent') AS name
    FROM jsonb_array_elements(p_categories) AS elem
    WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
  ) p
  JOIN (
    SELECT DISTINCT (elem->>'type') AS typ, elem->>'name' AS name
    FROM jsonb_array_elements(p_categories) AS elem
    WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
  ) c ON c.typ = p.typ AND c.name = p.name
  LIMIT 1;

  IF v_conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'insert_categories: category "%" cannot be both a parent and a child in the same batch (max 2 levels)', v_conflict_name;
  END IF;

  -- Phase 1: root-level categories. Explicit entries with no "parent", plus
  -- every distinct "parent" name referenced by a nested entry, auto-vivified
  -- with a NULL description. DISTINCT ON with a priority column makes
  -- explicit entries (priority 0) win over auto-derived ones (priority 1)
  -- when the same (type, name) appears as both.
  INSERT INTO public.categories (user_id, type, name, description)
  SELECT p_user_id, t, n, d
  FROM (
    SELECT DISTINCT ON (t, n) t, n, d
    FROM (
      SELECT (elem->>'type')::public.transaction_type AS t,
             elem->>'name' AS n,
             elem->>'description' AS d,
             0 AS priority
      FROM jsonb_array_elements(p_categories) AS elem
      WHERE elem->>'parent' IS NULL OR trim(elem->>'parent') = ''
      UNION ALL
      SELECT (elem->>'type')::public.transaction_type AS t,
             trim(elem->>'parent') AS n,
             NULL::text AS d,
             1 AS priority
      FROM jsonb_array_elements(p_categories) AS elem
      WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
    ) combined
    ORDER BY t, n, priority
  ) roots
  ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

  GET DIAGNOSTICS v_root_inserted = ROW_COUNT;

  -- Phase 2: nested categories. Resolve each "parent" name against that
  -- user's root-level (parent_id IS NULL) categories of the same type
  -- (guaranteed to exist after phase 1) and insert the child under it.
  INSERT INTO public.categories (user_id, type, name, description, parent_id)
  SELECT p_user_id, t, n, d, pid
  FROM (
    SELECT
      (elem->>'type')::public.transaction_type AS t,
      elem->>'name' AS n,
      elem->>'description' AS d,
      (
        SELECT c.id FROM public.categories c
        WHERE c.user_id = p_user_id
          AND c.type = (elem->>'type')::public.transaction_type
          AND c.name = trim(elem->>'parent')
          AND c.parent_id IS NULL
        LIMIT 1
      ) AS pid
    FROM jsonb_array_elements(p_categories) AS elem
    WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
  ) children
  WHERE pid IS NOT NULL
  ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

  GET DIAGNOSTICS v_child_inserted = ROW_COUNT;

  RETURN v_root_inserted + v_child_inserted;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_categories failed' USING ERRCODE = SQLSTATE;
END;
$$;

COMMENT ON FUNCTION insert_categories IS
  'Batch-insert categories for a user, ON CONFLICT DO NOTHING for duplicates. An entry may carry an optional "parent" field (bare root-level category name, same type) to create it as a nested (2nd-level) category; the parent is auto-created as a root category if it does not already exist. A name cannot be both a parent and a child in the same batch (max 2 levels).';

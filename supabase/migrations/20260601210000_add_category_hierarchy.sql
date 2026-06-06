-- 20260601210000_add_category_hierarchy.sql
-- Adds a closure table for 2-level category parent/child hierarchy.
-- Categories get an optional parent_id; hierarchy rows are maintained by triggers.

-- ─── 1. parent_id column on categories ────────────────────────────────────────

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES public.categories(id) ON DELETE SET NULL;

-- ─── 2. Closure table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.category_hierarchy (
  ancestor_id   uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  depth         int  NOT NULL CHECK (depth >= 0 AND depth <= 1),
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_category_hierarchy_ancestor_depth
  ON public.category_hierarchy(ancestor_id, depth);

CREATE INDEX IF NOT EXISTS idx_category_hierarchy_descendant_depth
  ON public.category_hierarchy(descendant_id, depth);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.category_hierarchy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own category hierarchy"
  ON public.category_hierarchy FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = category_hierarchy.ancestor_id
        AND c.user_id = auth.uid()
    )
  );

-- ─── 4. Validation trigger (BEFORE) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_category_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_parent_type public.transaction_type;
BEGIN
  IF new.parent_id IS NULL THEN
    RETURN new;
  END IF;

  -- Prevent self-parent
  IF new.parent_id = new.id THEN
    RAISE EXCEPTION 'Category cannot be parent of itself';
  END IF;

  -- Verify parent exists and has same type
  SELECT type INTO v_parent_type FROM public.categories WHERE id = new.parent_id;
  IF v_parent_type IS DISTINCT FROM new.type THEN
    RAISE EXCEPTION 'Parent category must have same type';
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER trg_validate_category_parent
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_category_parent();

-- ─── 5. Hierarchy maintenance trigger (AFTER) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete old parent relationship (depth = 1 means direct parent-child)
  DELETE FROM public.category_hierarchy
   WHERE descendant_id = new.id AND depth = 1;

  -- Insert self-reference (depth = 0)
  INSERT INTO public.category_hierarchy (ancestor_id, descendant_id, depth)
  VALUES (new.id, new.id, 0)
  ON CONFLICT DO NOTHING;

  -- Insert parent-child relationship if parent is set
  IF new.parent_id IS NOT NULL THEN
    INSERT INTO public.category_hierarchy (ancestor_id, descendant_id, depth)
    VALUES (new.parent_id, new.id, 1)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER trg_sync_category_hierarchy
  AFTER INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_category_hierarchy();

-- ─── 6. Backfill hierarchy rows for existing categories ──────────────────────

INSERT INTO public.category_hierarchy (ancestor_id, descendant_id, depth)
SELECT id, id, 0 FROM public.categories
ON CONFLICT DO NOTHING;

INSERT INTO public.category_hierarchy (ancestor_id, descendant_id, depth)
SELECT parent_id, id, 1 FROM public.categories WHERE parent_id IS NOT NULL
ON CONFLICT DO NOTHING;

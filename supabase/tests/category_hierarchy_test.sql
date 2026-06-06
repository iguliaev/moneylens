-- category_hierarchy_test.sql
-- pgTAP tests for category_hierarchy closure table and hierarchy invariants

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(14);

SELECT tests.create_supabase_user('hier_user@test.com');
SELECT tests.authenticate_as('hier_user@test.com');

-- ─── Table structure ───────────────────────────────────────────────────────────

SELECT extensions.has_table('public', 'category_hierarchy', 'category_hierarchy table exists');
SELECT extensions.has_column('public', 'category_hierarchy', 'ancestor_id', 'ancestor_id column exists');
SELECT extensions.has_column('public', 'category_hierarchy', 'descendant_id', 'descendant_id column exists');
SELECT extensions.has_column('public', 'category_hierarchy', 'depth', 'depth column exists');
SELECT extensions.col_is_pk('public', 'category_hierarchy', ARRAY['ancestor_id','descendant_id'], 'composite PK on ancestor_id, descendant_id');

-- ─── Hierarchy maintenance via trigger ────────────────────────────────────────

-- Insert a root category (no parent)
INSERT INTO public.categories (id, user_id, type, name)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  tests.get_supabase_uid('hier_user@test.com'),
  'spend',
  'Utilities'
);

-- Self-row (depth=0) must be auto-inserted by trigger
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.category_hierarchy
    WHERE ancestor_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND descendant_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND depth = 0),
  1::bigint,
  'Root category gets self-row depth=0 in hierarchy'
);

-- Insert a child category
INSERT INTO public.categories (id, user_id, type, name, parent_id)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  tests.get_supabase_uid('hier_user@test.com'),
  'spend',
  'Electricity',
  '00000000-0000-0000-0000-000000000001'::uuid
);

-- Self-row for child
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.category_hierarchy
    WHERE ancestor_id = '00000000-0000-0000-0000-000000000002'::uuid
      AND descendant_id = '00000000-0000-0000-0000-000000000002'::uuid
      AND depth = 0),
  1::bigint,
  'Child category gets self-row depth=0 in hierarchy'
);

-- Parent->child row (depth=1)
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.category_hierarchy
    WHERE ancestor_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND descendant_id = '00000000-0000-0000-0000-000000000002'::uuid
      AND depth = 1),
  1::bigint,
  'Parent->child row depth=1 exists in hierarchy'
);

-- ─── Invariants ────────────────────────────────────────────────────────────────

-- Cannot set a category as its own parent
SELECT extensions.throws_ok(
  $$ UPDATE public.categories
     SET parent_id = '00000000-0000-0000-0000-000000000001'::uuid
     WHERE id = '00000000-0000-0000-0000-000000000001'::uuid $$,
  'Category cannot be parent of itself',
  'Trigger prevents self-reference'
);

-- Cannot use parent with different type
INSERT INTO public.categories (id, user_id, type, name)
VALUES (
  '00000000-0000-0000-0000-000000000003'::uuid,
  tests.get_supabase_uid('hier_user@test.com'),
  'earn',
  'Salary'
);

SELECT extensions.throws_ok(
  $$ UPDATE public.categories
     SET parent_id = '00000000-0000-0000-0000-000000000001'::uuid
     WHERE id = '00000000-0000-0000-0000-000000000003'::uuid $$,
  'Parent category must have same type',
  'Trigger prevents cross-type parent assignment'
);

-- ─── Leaf detection ────────────────────────────────────────────────────────────

-- Utilities has a child → it is a parent (has depth=1 descendants)
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.category_hierarchy
    WHERE ancestor_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND depth = 1),
  1::bigint,
  'Parent has exactly one depth=1 descendant'
);

-- Electricity has no children
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.category_hierarchy
    WHERE ancestor_id = '00000000-0000-0000-0000-000000000002'::uuid
      AND depth = 1),
  0::bigint,
  'Leaf category has zero depth=1 descendants'
);

-- ─── Max depth enforcement ─────────────────────────────────────────────────────

-- Seed a second root category for re-parenting test
INSERT INTO public.categories (id, user_id, type, name)
VALUES (
  '00000000-0000-0000-0000-000000000004'::uuid,
  tests.get_supabase_uid('hier_user@test.com'),
  'spend',
  'OtherRoot'
);

-- Attempt to create a grandchild (child of Electricity, which is already a child)
SELECT extensions.throws_ok(
  $$ INSERT INTO public.categories (id, user_id, type, name, parent_id)
     VALUES (
       '00000000-0000-0000-0000-000000000005'::uuid,
       '00000000-0000-0000-0000-000000000099'::uuid,
       'spend',
       'GrandchildCategory',
       '00000000-0000-0000-0000-000000000002'
     ) $$,
  'Parent category already has a parent — max 2 levels allowed',
  'Trigger prevents grandchild creation (depth > 2)'
);

-- Attempt to re-parent a category that already has children (Utilities has Electricity)
SELECT extensions.throws_ok(
  $$ UPDATE public.categories
     SET parent_id = '00000000-0000-0000-0000-000000000004'::uuid
     WHERE id = '00000000-0000-0000-0000-000000000001'::uuid $$,
  'Cannot assign a parent to a category that already has children',
  'Trigger prevents re-parenting a category that already has children'
);

SELECT extensions.finish();
ROLLBACK;

-- supabase/tests/atomic_budget_with_links_test.sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- Setup two test users
select tests.create_supabase_user('atomic_budget_user1@test.com');
select tests.create_supabase_user('atomic_budget_user2@test.com');

-- Seed reference data for user2 (for cross-user security tests)
select tests.authenticate_as('atomic_budget_user2@test.com');

INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'BudgetUser2Cat')
ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

INSERT INTO public.tags (user_id, name)
VALUES (auth.uid(), 'BudgetUser2Tag')
ON CONFLICT (user_id, name) DO NOTHING;

select tests.authenticate_as('atomic_budget_user1@test.com');

-- Seed reference data for user1
INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'BudgetCat1'), (auth.uid(), 'spend'::public.transaction_type, 'BudgetCat2')
ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

INSERT INTO public.tags (user_id, name)
VALUES (auth.uid(), 'BudgetTag1'), (auth.uid(), 'BudgetTag2')
ON CONFLICT (user_id, name) DO NOTHING;

-- 1) create_budget_with_links function exists
SELECT has_function(
  'public', 'create_budget_with_links',
  ARRAY['jsonb', 'uuid[]', 'uuid[]'],
  'create_budget_with_links function should exist'
);

-- 2) create with no categories/tags returns a budget row
SELECT ok(
  (SELECT (public.create_budget_with_links(
    jsonb_build_object(
      'name', 'NoLinksBudget',
      'description', 'no links',
      'type', 'spend',
      'target_amount', 100
    ),
    ARRAY[]::uuid[],
    ARRAY[]::uuid[]
  )).id IS NOT NULL),
  'create_budget_with_links returns row with id'
);

-- 3) Budget is persisted in DB
SELECT ok(
  (SELECT COUNT(*) FROM public.budgets WHERE user_id = auth.uid() AND name = 'NoLinksBudget') = 1,
  'Budget persisted in DB after create_budget_with_links'
);

-- 4) create with categories and tags: budget + both link tables populated
SELECT ok(
  (SELECT (public.create_budget_with_links(
    jsonb_build_object(
      'name', 'WithLinksBudget',
      'description', 'has links',
      'type', 'spend',
      'target_amount', 200,
      'start_date', '2026-01-01',
      'end_date', '2026-12-31'
    ),
    ARRAY[(SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'BudgetCat1')],
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'BudgetTag1')]
  )).id IS NOT NULL),
  'create with links: returns budget id'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.budget_categories bc
   JOIN public.budgets b ON bc.budget_id = b.id
   WHERE b.user_id = auth.uid() AND b.name = 'WithLinksBudget') = 1,
  'Category association created atomically with budget'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.budget_tags bt
   JOIN public.budgets b ON bt.budget_id = b.id
   WHERE b.user_id = auth.uid() AND b.name = 'WithLinksBudget') = 1,
  'Tag association created atomically with budget'
);

-- 5) Atomicity: invalid category id raises 42501 — no orphan budget
SELECT throws_ok(
  $$
    SELECT public.create_budget_with_links(
      jsonb_build_object(
        'name', 'OrphanShouldNotExist',
        'type', 'spend',
        'target_amount', 300
      ),
      ARRAY['00000000-0000-0000-0000-000000000000'::uuid],
      ARRAY[]::uuid[]
    )
  $$,
  '42501'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.budgets WHERE user_id = auth.uid() AND name = 'OrphanShouldNotExist') = 0,
  'No orphan budget left after category ownership check fails'
);

-- 6) Atomicity: invalid tag id raises 42501 — no orphan budget
SELECT throws_ok(
  $$
    SELECT public.create_budget_with_links(
      jsonb_build_object(
        'name', 'OrphanShouldNotExist2',
        'type', 'spend',
        'target_amount', 300
      ),
      ARRAY[]::uuid[],
      ARRAY['00000000-0000-0000-0000-000000000000'::uuid]
    )
  $$,
  '42501'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.budgets WHERE user_id = auth.uid() AND name = 'OrphanShouldNotExist2') = 0,
  'No orphan budget left after tag ownership check fails'
);

-- 7) update_budget_with_links function exists
SELECT has_function(
  'public', 'update_budget_with_links',
  ARRAY['uuid', 'jsonb', 'uuid[]', 'uuid[]'],
  'update_budget_with_links function should exist'
);

-- 8) update: replaces categories/tags and updates fields
SELECT ok(
  (SELECT (public.update_budget_with_links(
    (SELECT id FROM public.budgets WHERE user_id = auth.uid() AND name = 'WithLinksBudget'),
    jsonb_build_object(
      'name', 'WithLinksBudget',
      'description', 'updated',
      'type', 'spend',
      'target_amount', 999
    ),
    ARRAY[(SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'BudgetCat2')],
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'BudgetTag2')]
  )).target_amount = 999),
  'update_budget_with_links returns updated target_amount'
);

-- 9) Updated fields persisted
SELECT ok(
  (SELECT COUNT(*) FROM public.budgets WHERE user_id = auth.uid() AND name = 'WithLinksBudget' AND target_amount = 999) = 1,
  'Updated fields persisted in DB'
);

-- 10) Categories replaced: BudgetCat2 now associated
SELECT ok(
  (SELECT COUNT(*) FROM public.budget_categories bc
   JOIN public.budgets b ON bc.budget_id = b.id
   JOIN public.categories c ON bc.category_id = c.id
   WHERE b.user_id = auth.uid() AND b.name = 'WithLinksBudget' AND c.name = 'BudgetCat2') = 1,
  'BudgetCat2 is now associated after update'
);

-- 11) Categories replaced: BudgetCat1 no longer associated
SELECT ok(
  (SELECT COUNT(*) FROM public.budget_categories bc
   JOIN public.budgets b ON bc.budget_id = b.id
   JOIN public.categories c ON bc.category_id = c.id
   WHERE b.user_id = auth.uid() AND b.name = 'WithLinksBudget' AND c.name = 'BudgetCat1') = 0,
  'BudgetCat1 removed after category replacement'
);

-- 12) Tags replaced: BudgetTag2 now associated, BudgetTag1 removed
SELECT ok(
  (SELECT COUNT(*) FROM public.budget_tags bt
   JOIN public.budgets b ON bt.budget_id = b.id
   JOIN public.tags t ON bt.tag_id = t.id
   WHERE b.user_id = auth.uid() AND b.name = 'WithLinksBudget' AND t.name = 'BudgetTag2') = 1,
  'BudgetTag2 is now associated after update'
);

-- 13) update with empty categories/tags: removes all links
SELECT ok(
  (SELECT (public.update_budget_with_links(
    (SELECT id FROM public.budgets WHERE user_id = auth.uid() AND name = 'WithLinksBudget'),
    jsonb_build_object(
      'name', 'WithLinksBudget', 'type', 'spend', 'target_amount', 999
    ),
    ARRAY[]::uuid[],
    ARRAY[]::uuid[]
  )).id IS NOT NULL),
  'update with empty links does not error'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.budget_categories bc
   JOIN public.budgets b ON bc.budget_id = b.id
   WHERE b.user_id = auth.uid() AND b.name = 'WithLinksBudget') = 0,
  'All categories removed when updated with empty array'
);

-- 14) Cross-user: update_budget_with_links raises exception for other user's budget
select tests.authenticate_as('atomic_budget_user2@test.com');

SELECT throws_like(
  $$
    SELECT public.update_budget_with_links(
      (SELECT id FROM public.budgets WHERE name = 'WithLinksBudget'),
      jsonb_build_object('name', 'hijacked', 'type', 'spend', 'target_amount', 1),
      ARRAY[]::uuid[],
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'User2 cannot update User1 budget'
);

-- 15-16) Cross-user ownership validation: user1 cannot use user2's categories/tags
select tests.authenticate_as('atomic_budget_user1@test.com');

-- 15) create with other user's category raises access denied
SELECT throws_like(
  $$
    SELECT public.create_budget_with_links(
      jsonb_build_object('name', 'ShouldFail', 'type', 'spend', 'target_amount', 1),
      ARRAY[(SELECT id FROM public.categories WHERE name = 'BudgetUser2Cat')],
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'Cannot create budget with another user''s category'
);

-- 16) create with other user's tag raises access denied
SELECT throws_like(
  $$
    SELECT public.create_budget_with_links(
      jsonb_build_object('name', 'ShouldFail2', 'type', 'spend', 'target_amount', 1),
      ARRAY[]::uuid[],
      ARRAY[(SELECT id FROM public.tags WHERE name = 'BudgetUser2Tag')]
    )
  $$,
  '%access denied%',
  'Cannot create budget with another user''s tag'
);

-- 17) update with other user's category raises access denied
SELECT throws_like(
  $$
    SELECT public.update_budget_with_links(
      (SELECT id FROM public.budgets WHERE user_id = auth.uid() AND name = 'WithLinksBudget'),
      jsonb_build_object('name', 'WithLinksBudget', 'type', 'spend', 'target_amount', 1),
      ARRAY[(SELECT id FROM public.categories WHERE name = 'BudgetUser2Cat')],
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'Cannot update budget with another user''s category'
);

-- 18) update with other user's tag raises access denied
SELECT throws_like(
  $$
    SELECT public.update_budget_with_links(
      (SELECT id FROM public.budgets WHERE user_id = auth.uid() AND name = 'WithLinksBudget'),
      jsonb_build_object('name', 'WithLinksBudget', 'type', 'spend', 'target_amount', 1),
      ARRAY[]::uuid[],
      ARRAY[(SELECT id FROM public.tags WHERE name = 'BudgetUser2Tag')]
    )
  $$,
  '%access denied%',
  'Cannot update budget with another user''s tag'
);

select * from finish();
ROLLBACK;

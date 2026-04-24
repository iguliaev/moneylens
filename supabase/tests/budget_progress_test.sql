begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- ============================================================
-- Test users
-- ============================================================
select tests.create_supabase_user('bptest1@test.com');
select tests.create_supabase_user('bptest2@test.com');

-- ============================================================
-- Tags (must exist before transaction_tags inserts to satisfy
-- the enforce_known_tags trigger)
-- ============================================================
insert into public.tags (user_id, name)
values
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-tag-only'),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-tag-both'),
  (tests.get_supabase_uid('bptest2@test.com'), 'bp-tag-u2');

-- ============================================================
-- Categories (one isolated category per test scenario to avoid
-- cross-contamination between budgets)
-- ============================================================
insert into public.categories (user_id, type, name)
values
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-cat-only'),     -- test 1
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-tag-tx-cat'),   -- test 2: tx2 needs a category
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-both-cat'),     -- test 3
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-date-cat'),     -- test 4
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-del-tx-cat'),   -- test 5
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-no-match-cat'), -- test 6
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-type-mis-cat'), -- test 7
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-del-bgt-cat'),  -- test 8
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-iso-cat'),      -- test 9
  (tests.get_supabase_uid('bptest1@test.com'), 'spend', 'bp-del-cat-cat');  -- test 10

-- ============================================================
-- Budgets for user1
-- ============================================================
insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
values
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test1-cat-only',      'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test2-tag-only',      'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test3-both',          'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test4-date-win',      'spend', 500.00, '2025-01-01', '2025-01-31'),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test5-del-tx',        'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test6-no-match',      'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test7-type-mismatch', 'earn',  500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test8-del-budget',    'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test9-isolation',     'spend', 500.00, null,         null        ),
  (tests.get_supabase_uid('bptest1@test.com'), 'bp-test10-del-cat',      'spend', 500.00, null,         null        );

-- ============================================================
-- Budget-category links
-- ============================================================
insert into public.budget_categories (budget_id, category_id)
select b.id, c.id
from public.budgets b
join public.categories c on c.user_id = b.user_id
where
  (b.name = 'bp-test1-cat-only'      and c.name = 'bp-cat-only')
  or (b.name = 'bp-test3-both'       and c.name = 'bp-both-cat')
  or (b.name = 'bp-test4-date-win'   and c.name = 'bp-date-cat')
  or (b.name = 'bp-test5-del-tx'     and c.name = 'bp-del-tx-cat')
  or (b.name = 'bp-test6-no-match'   and c.name = 'bp-no-match-cat')
  or (b.name = 'bp-test7-type-mismatch' and c.name = 'bp-type-mis-cat')
  or (b.name = 'bp-test8-del-budget' and c.name = 'bp-del-bgt-cat')
  or (b.name = 'bp-test9-isolation'  and c.name = 'bp-iso-cat')
  or (b.name = 'bp-test10-del-cat'   and c.name = 'bp-del-cat-cat');

-- ============================================================
-- Budget-tag links
-- ============================================================
insert into public.budget_tags (budget_id, tag_id)
select b.id, t.id
from public.budgets b
join public.tags t on t.user_id = b.user_id
where
  (b.name = 'bp-test2-tag-only' and t.name = 'bp-tag-only')
  or (b.name = 'bp-test3-both'  and t.name = 'bp-tag-both');

-- ============================================================
-- Transactions (insert as superuser with explicit user_id to
-- bypass RLS; tg_set_user_id only sets user_id when it is NULL)
-- ============================================================
with cats as (
  select name, id
  from public.categories
  where user_id = tests.get_supabase_uid('bptest1@test.com')
)
insert into public.transactions (id, user_id, date, type, category_id, amount, notes)
values
  -- Test 1: matches category link of bp-test1-cat-only
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-cat-only'),     100.00, 'bp-tx1'),
  -- Test 2: will be linked to tag 'bp-tag-only' via transaction_tags
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-tag-tx-cat'),   50.00,  'bp-tx2'),
  -- Test 3: matches BOTH category 'bp-both-cat' AND tag 'bp-tag-both' → dedup
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-both-cat'),     75.00,  'bp-tx3'),
  -- Test 4: date '2025-06-15' is outside window [2025-01-01, 2025-01-31]
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-date-cat'),     200.00, 'bp-tx4'),
  -- Test 5: will be soft-deleted below
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-del-tx-cat'),   300.00, 'bp-tx5'),
  -- Test 7: type='spend' but linked budget is type='earn' → mismatch
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-type-mis-cat'), 400.00, 'bp-tx7'),
  -- Test 9: user2's transaction pointing to user1's category (forced as superuser
  --         to test the tx.user_id = b.user_id isolation filter)
  (gen_random_uuid(), tests.get_supabase_uid('bptest2@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-iso-cat'),      999.00, 'bp-tx9-u2'),
  -- Test 10: matches category that will be soft-deleted below
  (gen_random_uuid(), tests.get_supabase_uid('bptest1@test.com'), '2025-06-15', 'spend',
    (select id from cats where name = 'bp-del-cat-cat'),  500.00, 'bp-tx10');

-- ============================================================
-- Transaction-tag links (tests 2 and 3)
-- ============================================================
insert into public.transaction_tags (transaction_id, tag_id)
select tx.id, tg.id
from public.transactions tx
join public.tags tg on tg.user_id = tests.get_supabase_uid('bptest1@test.com')
where
  (tx.notes = 'bp-tx2' and tg.name = 'bp-tag-only')
  or (tx.notes = 'bp-tx3' and tg.name = 'bp-tag-both');

-- ============================================================
-- Soft-delete targets (all done as superuser before RLS kicks in)
-- ============================================================

-- Test 5: soft-delete the matching transaction
update public.transactions
set deleted_at = now()
where notes = 'bp-tx5';

-- Test 8: soft-delete the budget itself
update public.budgets
set deleted_at = now()
where name = 'bp-test8-del-budget'
  and user_id = tests.get_supabase_uid('bptest1@test.com');

-- Test 10: soft-delete the linked category
update public.categories
set deleted_at = now()
where name = 'bp-del-cat-cat'
  and user_id = tests.get_supabase_uid('bptest1@test.com');

-- ============================================================
-- Authenticate as user1 to exercise get_budget_progress()
-- (SECURITY INVOKER → function uses auth.uid() = user1's uid)
-- ============================================================
select tests.authenticate_as('bptest1@test.com');

-- Test 1: Budget with ONLY a category link, matching transaction → counted
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test1-cat-only' $$,
  array[100.00::numeric],
  'Test 1: category-only link: matching transaction is counted'
);

-- Test 2: Budget with ONLY a tag link, matching via transaction_tags → counted
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test2-tag-only' $$,
  array[50.00::numeric],
  'Test 2: tag-only link: matching transaction via transaction_tags is counted'
);

-- Test 3: Transaction matches via BOTH category and tag → counted once (UNION dedup)
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test3-both' $$,
  array[75.00::numeric],
  'Test 3: category+tag dual match: transaction counted exactly once via UNION deduplication'
);

-- Test 4: Transaction date outside start_date/end_date window → NOT counted
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test4-date-win' $$,
  array[0.00::numeric],
  'Test 4: transaction outside date window is not counted'
);

-- Test 5: Soft-deleted transaction (deleted_at IS NOT NULL) → NOT counted
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test5-del-tx' $$,
  array[0.00::numeric],
  'Test 5: soft-deleted transaction is not counted'
);

-- Test 6: Budget with no matching transactions → current_amount = 0 via COALESCE
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test6-no-match' $$,
  array[0.00::numeric],
  'Test 6: budget with no matching transactions returns 0 (COALESCE)'
);

-- Test 7: Budget type='earn' but only 'spend' transactions exist → NOT counted
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test7-type-mismatch' $$,
  array[0.00::numeric],
  'Test 7: transaction type mismatch with budget type is not counted'
);

-- Test 8: Soft-deleted budget (deleted_at IS NOT NULL) → NOT returned by function
select ok(
  (select count(*) from get_budget_progress() where name = 'bp-test8-del-budget') = 0,
  'Test 8: soft-deleted budget is not returned by get_budget_progress()'
);

-- Test 9: User isolation — user2 transaction does not count toward user1's budget
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test9-isolation' $$,
  array[0.00::numeric],
  'Test 9: another user''s transaction does not count toward user1''s budget'
);

-- Test 10: Linked category is soft-deleted → cat.deleted_at IS NULL filter excludes it
select results_eq(
  $$ select current_amount from get_budget_progress() where name = 'bp-test10-del-cat' $$,
  array[0.00::numeric],
  'Test 10: transaction via a soft-deleted category link is not counted'
);

select * from finish();
rollback;

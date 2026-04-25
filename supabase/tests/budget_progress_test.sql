begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- ── Users ────────────────────────────────────────────────────────────────────
select tests.create_supabase_user('bp_u1@test.com');
select tests.create_supabase_user('bp_u2@test.com');

-- ── Setup ────────────────────────────────────────────────────────────────────
-- All data is inserted before authenticate_as so it bypasses RLS.
-- Each budget uses a unique category AND a unique month to prevent
-- cross-budget contamination.
--
-- Budget / transaction map:
--   b1  (spend, c1,             Jan-2025): tx1 spend $100  → current_amount = 100
--   b2  (spend, groceries tag,  Feb-2025): tx2 spend $200 tagged groceries → 200
--   b3  (spend, c3 + groceries, Mar-2025): tx3 spend $300 tagged groceries
--                                           matches via BOTH arms → UNION dedup → 300
--   b4  (spend, c4,             Apr-2025): tx4_in $50 (Apr) + tx4_out $999 (May)
--                                           only Apr is in range → 50
--   b5  (spend, c5,             Jun-2025): tx5 spend $500 soft-deleted → 0
--   b6  (spend, c6,             Jul-2025): no transactions → 0
--   b7  (spend, c7,             Aug-2025): tx7 EARN $700; budget is spend → type mismatch → 0
--   b8  (spend, c8,             Sep-2025): tx8 $800 but budget deleted → not returned
--   b9  (spend, c9,             Oct-2025): tx9 user1 $900; user2 has own budget → isolation
--   b10 (spend, c10,            Nov-2025): tx10 $1000 but c10 soft-deleted → 0

with
  -- ── Tags ──────────────────────────────────────────────────────────────────
  -- Tags for user1 (groceries used for tag-linked budget tests).
  -- Tags for user2 also seeded to avoid enforce_known_tags errors for user2 txs.
  t_u1_groceries as (
    insert into public.tags (user_id, name)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'groceries')
    returning id
  ),
  t_u2_groceries as (
    insert into public.tags (user_id, name)
    values (tests.get_supabase_uid('bp_u2@test.com'), 'groceries')
    returning id
  ),

  -- ── Categories for user1 ─────────────────────────────────────────────────
  -- c7 is earn so that tx7 (earn) has a valid category, while b7 is spend.
  c1  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c1')  returning id),
  c2  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c2')  returning id),
  c3  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c3')  returning id),
  c4  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c4')  returning id),
  c5  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c5')  returning id),
  c6  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c6')  returning id),
  c7  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'earn', 'bp_c7')  returning id),
  c8  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c8')  returning id),
  c9  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c9')  returning id),
  c10 as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c10') returning id),
  c_u2 as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u2@test.com'), 'spend', 'bp_c_u2') returning id),

  -- ── Budgets ───────────────────────────────────────────────────────────────
  b1 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'cat-only',      'spend', 500, '2025-01-01', '2025-01-31')
    returning id
  ),
  b2 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'tag-only',      'spend', 500, '2025-02-01', '2025-02-28')
    returning id
  ),
  b3 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'dedup',         'spend', 500, '2025-03-01', '2025-03-31')
    returning id
  ),
  b4 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'dated',         'spend', 500, '2025-04-01', '2025-04-30')
    returning id
  ),
  b5 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'soft-del-tx',   'spend', 500, '2025-06-01', '2025-06-30')
    returning id
  ),
  b6 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'empty',         'spend', 500, '2025-07-01', '2025-07-31')
    returning id
  ),
  b7 as (
    -- SPEND budget linked to an EARN category; tx7 is earn → type mismatch → 0
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'type-mismatch', 'spend', 500, '2025-08-01', '2025-08-31')
    returning id
  ),
  b8 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date, deleted_at)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'deleted',       'spend', 500, '2025-09-01', '2025-09-30', now())
    returning id
  ),
  b9 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'user-isolation','spend', 500, '2025-10-01', '2025-10-31')
    returning id
  ),
  b10 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'deleted-cat',   'spend', 500, '2025-11-01', '2025-11-30')
    returning id
  ),
  b_u2 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u2@test.com'), 'u2-budget',     'spend', 500, '2025-10-01', '2025-10-31')
    returning id
  ),

  -- ── Budget-category links ─────────────────────────────────────────────────
  bc1   as (insert into public.budget_categories (budget_id, category_id) select b1.id,  c1.id   from b1,  c1   returning budget_id),
  bc3   as (insert into public.budget_categories (budget_id, category_id) select b3.id,  c3.id   from b3,  c3   returning budget_id),
  bc4   as (insert into public.budget_categories (budget_id, category_id) select b4.id,  c4.id   from b4,  c4   returning budget_id),
  bc5   as (insert into public.budget_categories (budget_id, category_id) select b5.id,  c5.id   from b5,  c5   returning budget_id),
  bc6   as (insert into public.budget_categories (budget_id, category_id) select b6.id,  c6.id   from b6,  c6   returning budget_id),
  bc7   as (insert into public.budget_categories (budget_id, category_id) select b7.id,  c7.id   from b7,  c7   returning budget_id),
  bc8   as (insert into public.budget_categories (budget_id, category_id) select b8.id,  c8.id   from b8,  c8   returning budget_id),
  bc9   as (insert into public.budget_categories (budget_id, category_id) select b9.id,  c9.id   from b9,  c9   returning budget_id),
  bc10  as (insert into public.budget_categories (budget_id, category_id) select b10.id, c10.id  from b10, c10  returning budget_id),
  bc_u2 as (insert into public.budget_categories (budget_id, category_id) select b_u2.id, c_u2.id from b_u2, c_u2 returning budget_id),

  -- ── Budget-tag links ──────────────────────────────────────────────────────
  bt2 as (
    -- b2 is tag-only: no category link, just groceries tag
    insert into public.budget_tags (budget_id, tag_id)
    select b2.id, t_u1_groceries.id from b2, t_u1_groceries
    returning budget_id
  ),
  bt3 as (
    -- b3 has BOTH a category (bc3) and a groceries tag for the dedup test
    insert into public.budget_tags (budget_id, tag_id)
    select b3.id, t_u1_groceries.id from b3, t_u1_groceries
    returning budget_id
  ),

  -- ── Transactions ──────────────────────────────────────────────────────────
  tx1 as (
    -- test 1: spend in c1 → matches b1 via category
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-01-15', 'spend', c1.id, 100.00 from c1
    returning id
  ),
  tx2 as (
    -- test 2: spend in c2, tagged groceries → matches b2 via tag
    -- c2 is NOT linked to any budget via category, so only the tag arm fires
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-02-15', 'spend', c2.id, 200.00 from c2
    returning id
  ),
  tt2 as (
    insert into public.transaction_tags (transaction_id, tag_id)
    select tx2.id, t_u1_groceries.id from tx2, t_u1_groceries
    returning transaction_id
  ),
  tx3 as (
    -- test 3 (dedup): spend in c3, tagged groceries → matches b3 via BOTH arms
    -- UNION (not UNION ALL) deduplicates → counted once at $300
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-03-15', 'spend', c3.id, 300.00 from c3
    returning id
  ),
  tt3 as (
    insert into public.transaction_tags (transaction_id, tag_id)
    select tx3.id, t_u1_groceries.id from tx3, t_u1_groceries
    returning transaction_id
  ),
  tx4_in as (
    -- test 4: inside b4's Apr range → counted
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-04-15', 'spend', c4.id, 50.00 from c4
    returning id
  ),
  tx4_out as (
    -- test 4: outside b4's Apr range (May) → NOT counted
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-05-15', 'spend', c4.id, 999.00 from c4
    returning id
  ),
  tx5 as (
    -- test 5: soft-deleted transaction → NOT counted
    insert into public.transactions (user_id, date, type, category_id, amount, deleted_at)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-06-15', 'spend', c5.id, 500.00, now() from c5
    returning id
  ),
  -- test 6: no transaction for c6 / b6 (empty budget)
  tx7 as (
    -- test 7 (type mismatch): earn transaction in c7 (earn); b7 is SPEND → not counted
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-08-15', 'earn', c7.id, 700.00 from c7
    returning id
  ),
  tx8 as (
    -- test 8: transaction exists but budget b8 is deleted → b8 not returned
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-09-15', 'spend', c8.id, 800.00 from c8
    returning id
  ),
  tx9 as (
    -- test 9: user1's transaction in c9 ($900); user2 has separate budget → isolation
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-10-15', 'spend', c9.id, 900.00 from c9
    returning id
  ),
  tx_u2 as (
    -- test 9: user2's transaction; must NOT appear in user1's get_budget_progress()
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u2@test.com'), '2025-10-15', 'spend', c_u2.id, 999.00 from c_u2
    returning id
  ),
  tx10 as (
    -- test 10: valid transaction in c10 ($1000); c10 will be soft-deleted below
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-11-15', 'spend', c10.id, 1000.00 from c10
    returning id
  )
-- execute all CTEs
select 1
from bc1, bc3, bc4, bc5, bc6, bc7, bc8, bc9, bc10, bc_u2,
     bt2, bt3, tt2, tt3,
     tx1, tx2, tx3, tx4_in, tx4_out, tx5, tx7, tx8, tx9, tx_u2, tx10;

-- test 10 pre-condition: soft-delete c10 so the category link is excluded by the function
update public.categories
set deleted_at = now()
where user_id = tests.get_supabase_uid('bp_u1@test.com') and name = 'bp_c10';

-- ── Assertions ───────────────────────────────────────────────────────────────
select tests.authenticate_as('bp_u1@test.com');

-- 1) Category-only budget: spend tx in linked category → current_amount = 100
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'cat-only' $$,
    array[100.00::numeric],
    'category-only budget counts matching transaction'
);

-- 2) Tag-only budget: spend tx tagged with linked tag → current_amount = 200
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'tag-only' $$,
    array[200.00::numeric],
    'tag-only budget counts transaction matched via tag'
);

-- 3) Dedup: transaction matches via BOTH category AND tag links → counted once ($300 not $600)
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'dedup' $$,
    array[300.00::numeric],
    'UNION deduplication prevents double-counting when transaction matches via both category and tag'
);

-- 4) Date range: only the in-range transaction ($50) is counted; out-of-range ($999) excluded
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'dated' $$,
    array[50.00::numeric],
    'date range filter excludes transactions outside start_date/end_date'
);

-- 5) Soft-deleted transaction: not counted → current_amount = 0
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'soft-del-tx' $$,
    array[0.00::numeric],
    'soft-deleted transaction is excluded from budget progress'
);

-- 6) Empty budget: no matching transactions → current_amount = 0 (COALESCE)
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'empty' $$,
    array[0.00::numeric],
    'budget with no matching transactions returns current_amount = 0'
);

-- 7) Type mismatch: earn transaction in spend budget → not counted → current_amount = 0
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'type-mismatch' $$,
    array[0.00::numeric],
    'transaction with wrong type is excluded from budget progress'
);

-- 8) Soft-deleted budget: must not appear in results at all
select is_empty(
    $$ select id from public.get_budget_progress() where name = 'deleted' $$,
    'soft-deleted budget is not returned by get_budget_progress()'
);

-- 9) User isolation: user1 sees their own budget (current_amount=900) and NOT user2's budget
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'user-isolation' $$,
    array[900.00::numeric],
    'user1 budget shows only user1 transactions (not user2 amount of 999)'
);
select is_empty(
    $$ select id from public.get_budget_progress() where name = 'u2-budget' $$,
    'user2 budget is not visible to user1'
);

-- 10) Soft-deleted category: category link excluded → current_amount = 0
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'deleted-cat' $$,
    array[0.00::numeric],
    'budget linked to a soft-deleted category returns current_amount = 0'
);

select * from finish();

rollback;

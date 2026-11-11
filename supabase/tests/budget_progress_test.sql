begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- ── Users ────────────────────────────────────────────────────────────────────
select tests.create_supabase_user('bp_u1@test.com');
select tests.create_supabase_user('bp_u2@test.com');

-- ── Setup ────────────────────────────────────────────────────────────────────
-- All data is inserted before authenticate_as so it bypasses RLS.
-- Each user1 budget has its own date window so transactions cannot leak
-- between budgets (some budgets deliberately share tags or a category).
--
-- Budget / transaction map:
--   b1  (spend, c1,             Jan-2025): tx1 spend $100  → current_amount = 100
--   b2  (spend, groceries tag,  Feb-2025): tx2 spend $200 tagged groceries → 200
--   b3  (spend, c3 + groceries, Mar-2025): tx3 spend $300 tagged groceries
--                                           satisfies both sets (AND) → counted once → 300
--   b4  (spend, c4,             Apr-2025): tx4_in $50 (Apr) + tx4_out $999 (May)
--                                           only Apr is in range → 50
--   b5  (spend, c5,             Jun-2025): tx5 spend $500 soft-deleted → 0
--   b6  (spend, c6,             Jul-2025): no transactions → 0
--   b7  (spend, c7,             Aug-2025): tx7 EARN $700; budget is spend → type mismatch → 0
--   b8  (spend, c8,             Sep-2025): tx8 $800 but budget deleted → not returned
--   b9  (spend, c9,             Oct-2025): tx9 user1 $900; user2 has own budget → isolation
--   b10 (spend, c10,            Nov-2025): tx10 $1000 but c10 soft-deleted → 0
--   b11 (spend, c11 (parent),   Dec-2025): tx11 $150 filed under c11c (child) → matches via category_hierarchy → 150
--   b12 (spend, c12 + c12c,     Jan-2026): tx12 $250 filed under c12c; b12 links BOTH c12 (parent) and
--                                           c12c (child) → two hierarchy paths, counted once → 250 not 500
--
-- Categories and tags are combined with AND (OR within each set); an empty set is no constraint:
--   b13 (spend, c13a + and_x,   Feb-2026): tx13_both $100 (c13a + and_x) counts; tx13_cat_only $10 and
--                                           tx13_tag_only $1 each satisfy only one set → 100
--   b14 (spend, c14a|c14b + and_x|and_y, Mar-2026): OR inside each set, AND between them:
--                                           tx14a $20 (c14a,and_x) + tx14b $30 (c14b,and_y) count;
--                                           tx14e $13 (c14a, BOTH tags) counts once;
--                                           tx14c $5 (c14a, no tag), tx14d $7 (other cat, and_x) don't → 63
--   b13 also has tx13_out $1000 satisfying both sets but outside its window → still 100
--   b15 (spend, no links,       Apr-2026): tx15 $999 in window, but a budget with no live links → 0
--   b16 (spend, soft-deleted tag only, May-2026): tx16 $888 tagged with it; no LIVE links → 0
--   Liveness is judged per set; a dead set is empty = no constraint:
--   b17 (spend, c17 + soft-deleted tag, Jun-2026): tx17a $40 in c17 untagged counts; tx17b $9
--                                           (other cat, dead tag) doesn't → 40
--   b18 (spend, soft-deleted c18 + and_x, Jul-2026): tx18a $60 (other cat, and_x) counts;
--                                           tx18b $4 (other cat, no tag) doesn't → 60
--   Open-ended date sides (each has its own category c19/c20/c21):
--   b19 (end 2026-08-31 only):   $11 on the end date, $22 in 2020 count; $500 on 2026-09-01 doesn't → 33
--   b20 (start 2026-10-01 only): $5 on the start date, $6 in 2036 count; $700 on 2026-09-30 doesn't → 11
--   b21 (no dates):              $3 (2019) + $4 (2031) both count → 7
--   b22 (spend, c22 parent + and_x, Nov-2026): tx22a $70 under child c22c + and_x counts;
--                                           tx22b $2 under c22c, no tag, and tx22c $3 (other cat, and_x) don't → 70

with
  -- ── Tags ──────────────────────────────────────────────────────────────────
  -- Tag for user1 (groceries used for tag-linked budget tests).
  t_u1_groceries as (
    insert into public.tags (user_id, name)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'groceries')
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
  c11  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c11_parent') returning id),
  c11c as (insert into public.categories (user_id, type, name, parent_id) select tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c11_child', c11.id from c11 returning id),
  c12  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c12_parent') returning id),
  c12c as (insert into public.categories (user_id, type, name, parent_id) select tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c12_child', c12.id from c12 returning id),
  c13a  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c13a')  returning id),
  c14a  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c14a')  returning id),
  c14b  as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c14b')  returning id),
  c_oth as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c_other') returning id),
  c17   as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c17') returning id),
  c18   as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c18') returning id),
  c19   as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c19') returning id),
  c20   as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c20') returning id),
  c21   as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c21') returning id),
  c22   as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c22_parent') returning id),
  c22c  as (insert into public.categories (user_id, type, name, parent_id) select tests.get_supabase_uid('bp_u1@test.com'), 'spend', 'bp_c22_child', c22.id from c22 returning id),
  c_u2 as (insert into public.categories (user_id, type, name) values (tests.get_supabase_uid('bp_u2@test.com'), 'spend', 'bp_c_u2') returning id),

  -- ── Tags for the AND tests ────────────────────────────────────────────────
  t_x    as (insert into public.tags (user_id, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'and_x')    returning id),
  t_y    as (insert into public.tags (user_id, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'and_y')    returning id),
  t_dead as (insert into public.tags (user_id, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'and_dead') returning id),
  t_dead2 as (insert into public.tags (user_id, name) values (tests.get_supabase_uid('bp_u1@test.com'), 'and_dead2') returning id),

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
    values (tests.get_supabase_uid('bp_u1@test.com'), 'cat-and-tag',   'spend', 500, '2025-03-01', '2025-03-31')
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
  b11 as (
    -- test 11: budget linked to a PARENT category; tx filed under its CHILD
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'parent-category', 'spend', 500, '2025-12-01', '2025-12-31')
    returning id
  ),
  b12 as (
    -- test 12: budget linked to BOTH a parent AND its own child; one tx under
    -- the child must still be counted once, not doubled
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'parent-and-child-dedup', 'spend', 500, '2026-01-01', '2026-01-31')
    returning id
  ),
  b13 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'and-cat-tag',   'spend', 500, '2026-02-01', '2026-02-28')
    returning id
  ),
  b14 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'and-multi',     'spend', 500, '2026-03-01', '2026-03-31')
    returning id
  ),
  b15 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'no-links',      'spend', 500, '2026-04-01', '2026-04-30')
    returning id
  ),
  b16 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'dead-tag-only', 'spend', 500, '2026-05-01', '2026-05-31')
    returning id
  ),
  b17 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'live-cat-dead-tag', 'spend', 500, '2026-06-01', '2026-06-30')
    returning id
  ),
  b18 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'dead-cat-live-tag', 'spend', 500, '2026-07-01', '2026-07-31')
    returning id
  ),
  b19 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'open-start',    'spend', 500, null, '2026-08-31')
    returning id
  ),
  b20 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'open-end',      'spend', 500, '2026-10-01', null)
    returning id
  ),
  b21 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'open-both',     'spend', 500, null, null)
    returning id
  ),
  b22 as (
    insert into public.budgets (user_id, name, type, target_amount, start_date, end_date)
    values (tests.get_supabase_uid('bp_u1@test.com'), 'parent-and-tag', 'spend', 500, '2026-11-01', '2026-11-30')
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
  bc11  as (insert into public.budget_categories (budget_id, category_id) select b11.id, c11.id  from b11, c11  returning budget_id),
  bc12a as (insert into public.budget_categories (budget_id, category_id) select b12.id, c12.id  from b12, c12  returning budget_id),
  bc12b as (insert into public.budget_categories (budget_id, category_id) select b12.id, c12c.id from b12, c12c returning budget_id),
  bc13  as (insert into public.budget_categories (budget_id, category_id) select b13.id, c13a.id from b13, c13a returning budget_id),
  bc14a as (insert into public.budget_categories (budget_id, category_id) select b14.id, c14a.id from b14, c14a returning budget_id),
  bc14b as (insert into public.budget_categories (budget_id, category_id) select b14.id, c14b.id from b14, c14b returning budget_id),
  bc17  as (insert into public.budget_categories (budget_id, category_id) select b17.id, c17.id from b17, c17 returning budget_id),
  bc18  as (insert into public.budget_categories (budget_id, category_id) select b18.id, c18.id from b18, c18 returning budget_id),
  bc19  as (insert into public.budget_categories (budget_id, category_id) select b19.id, c19.id from b19, c19 returning budget_id),
  bc20  as (insert into public.budget_categories (budget_id, category_id) select b20.id, c20.id from b20, c20 returning budget_id),
  bc21  as (insert into public.budget_categories (budget_id, category_id) select b21.id, c21.id from b21, c21 returning budget_id),
  bc22  as (insert into public.budget_categories (budget_id, category_id) select b22.id, c22.id from b22, c22 returning budget_id),
  bc_u2 as (insert into public.budget_categories (budget_id, category_id) select b_u2.id, c_u2.id from b_u2, c_u2 returning budget_id),

  -- ── Budget-tag links ──────────────────────────────────────────────────────
  bt2 as (
    -- b2 is tag-only: no category link, just groceries tag
    insert into public.budget_tags (budget_id, tag_id)
    select b2.id, t_u1_groceries.id from b2, t_u1_groceries
    returning budget_id
  ),
  bt3 as (
    -- b3 links BOTH a category (bc3) and the groceries tag; its single transaction
    -- satisfies both sets
    insert into public.budget_tags (budget_id, tag_id)
    select b3.id, t_u1_groceries.id from b3, t_u1_groceries
    returning budget_id
  ),
  bt13 as (insert into public.budget_tags (budget_id, tag_id) select b13.id, t_x.id from b13, t_x returning budget_id),
  bt14x as (insert into public.budget_tags (budget_id, tag_id) select b14.id, t_x.id from b14, t_x returning budget_id),
  bt14y as (insert into public.budget_tags (budget_id, tag_id) select b14.id, t_y.id from b14, t_y returning budget_id),
  bt16 as (
    -- b16 links ONLY a tag that is soft-deleted below → no live links
    insert into public.budget_tags (budget_id, tag_id)
    select b16.id, t_dead.id from b16, t_dead
    returning budget_id
  ),
  bt17 as (insert into public.budget_tags (budget_id, tag_id) select b17.id, t_dead2.id from b17, t_dead2 returning budget_id),
  bt18 as (insert into public.budget_tags (budget_id, tag_id) select b18.id, t_x.id from b18, t_x returning budget_id),
  bt22 as (insert into public.budget_tags (budget_id, tag_id) select b22.id, t_x.id from b22, t_x returning budget_id),

  -- ── Transactions ──────────────────────────────────────────────────────────
  tx1 as (
    -- test 1: spend in c1 → matches b1 via category
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-01-15', 'spend', c1.id, 100.00 from c1
    returning id
  ),
  tx2 as (
    -- test 2: spend in c2, tagged groceries → matches b2 via tag
    -- b2 has no category links (empty set = no constraint), so only its tag set filters
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
    -- test 3: spend in c3, tagged groceries → satisfies b3's category AND tag
    -- sets → counted once at $300
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
  ),
  tx11 as (
    -- test 11: spend filed under c11's CHILD → must match b11 via category_hierarchy
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2025-12-15', 'spend', c11c.id, 150.00 from c11c
    returning id
  ),
  tx12 as (
    -- test 12: spend filed under c12's CHILD; b12 links both c12 (parent) and
    -- c12c (child) → must be counted ONCE, not twice
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-01-15', 'spend', c12c.id, 250.00 from c12c
    returning id
  ),
  tx13_both as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-02-10', 'spend', c13a.id, 100.00 from c13a
    returning id
  ),
  tt13_both as (insert into public.transaction_tags (transaction_id, tag_id) select tx13_both.id, t_x.id from tx13_both, t_x returning transaction_id),
  tx13_cat_only as (
    -- right category, no tag → fails the tag set
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-02-11', 'spend', c13a.id, 10.00 from c13a
    returning id
  ),
  tx13_tag_only as (
    -- right tag, other category → fails the category set
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-02-12', 'spend', c_oth.id, 1.00 from c_oth
    returning id
  ),
  tt13_tag_only as (insert into public.transaction_tags (transaction_id, tag_id) select tx13_tag_only.id, t_x.id from tx13_tag_only, t_x returning transaction_id),
  tx14a as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-03-10', 'spend', c14a.id, 20.00 from c14a
    returning id
  ),
  tt14a as (insert into public.transaction_tags (transaction_id, tag_id) select tx14a.id, t_x.id from tx14a, t_x returning transaction_id),
  tx14b as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-03-11', 'spend', c14b.id, 30.00 from c14b
    returning id
  ),
  tt14b as (insert into public.transaction_tags (transaction_id, tag_id) select tx14b.id, t_y.id from tx14b, t_y returning transaction_id),
  tx14c as (
    -- category in the set, no tag → excluded
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-03-12', 'spend', c14a.id, 5.00 from c14a
    returning id
  ),
  tx14d as (
    -- tag in the set, category outside it → excluded
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-03-13', 'spend', c_oth.id, 7.00 from c_oth
    returning id
  ),
  tt14d as (insert into public.transaction_tags (transaction_id, tag_id) select tx14d.id, t_x.id from tx14d, t_x returning transaction_id),
  tx15 as (
    -- spend inside b15's window, but b15 has no links at all
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-04-10', 'spend', c_oth.id, 999.00 from c_oth
    returning id
  ),
  tx16 as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-05-10', 'spend', c_oth.id, 888.00 from c_oth
    returning id
  ),
  tt16 as (insert into public.transaction_tags (transaction_id, tag_id) select tx16.id, t_dead.id from tx16, t_dead returning transaction_id),
  tx13_out as (
    -- satisfies b13's category AND tag sets but falls outside its Feb-2026 window → excluded
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-03-01', 'spend', c13a.id, 1000.00 from c13a
    returning id
  ),
  tt13_out as (insert into public.transaction_tags (transaction_id, tag_id) select tx13_out.id, t_x.id from tx13_out, t_x returning transaction_id),
  tx14e as (
    -- carries BOTH of b14's tags → still counted once
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-03-14', 'spend', c14a.id, 13.00 from c14a
    returning id
  ),
  tt14e_x as (insert into public.transaction_tags (transaction_id, tag_id) select tx14e.id, t_x.id from tx14e, t_x returning transaction_id),
  tt14e_y as (insert into public.transaction_tags (transaction_id, tag_id) select tx14e.id, t_y.id from tx14e, t_y returning transaction_id),
  tx17a as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-06-10', 'spend', c17.id, 40.00 from c17
    returning id
  ),
  tx17b as (
    -- only the dead tag matches, and the category set is live → excluded
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-06-11', 'spend', c_oth.id, 9.00 from c_oth
    returning id
  ),
  tt17b as (insert into public.transaction_tags (transaction_id, tag_id) select tx17b.id, t_dead2.id from tx17b, t_dead2 returning transaction_id),
  tx18a as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-07-10', 'spend', c_oth.id, 60.00 from c_oth
    returning id
  ),
  tt18a as (insert into public.transaction_tags (transaction_id, tag_id) select tx18a.id, t_x.id from tx18a, t_x returning transaction_id),
  tx18b as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-07-11', 'spend', c_oth.id, 4.00 from c_oth
    returning id
  ),
  tx19 as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), d.dt::date, 'spend', c19.id, d.amt
    from c19, (values ('2026-08-31', 11.00), ('2020-01-01', 22.00), ('2026-09-01', 500.00)) as d(dt, amt)
    returning id
  ),
  tx20 as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), d.dt::date, 'spend', c20.id, d.amt
    from c20, (values ('2026-10-01', 5.00), ('2036-01-01', 6.00), ('2026-09-30', 700.00)) as d(dt, amt)
    returning id
  ),
  tx21 as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), d.dt::date, 'spend', c21.id, d.amt
    from c21, (values ('2019-06-01', 3.00), ('2031-06-01', 4.00)) as d(dt, amt)
    returning id
  ),
  tx22a as (
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-11-10', 'spend', c22c.id, 70.00 from c22c
    returning id
  ),
  tt22a as (insert into public.transaction_tags (transaction_id, tag_id) select tx22a.id, t_x.id from tx22a, t_x returning transaction_id),
  tx22b as (
    -- under the child but untagged → fails the tag set
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-11-11', 'spend', c22c.id, 2.00 from c22c
    returning id
  ),
  tx22c as (
    -- tagged but outside the parent's subtree → fails the category set
    insert into public.transactions (user_id, date, type, category_id, amount)
    select tests.get_supabase_uid('bp_u1@test.com'), '2026-11-12', 'spend', c_oth.id, 3.00 from c_oth
    returning id
  ),
  tt22c as (insert into public.transaction_tags (transaction_id, tag_id) select tx22c.id, t_x.id from tx22c, t_x returning transaction_id)
-- execute all CTEs
select 1
from bc1, bc3, bc4, bc5, bc6, bc7, bc8, bc9, bc10, bc11, bc12a, bc12b, bc13, bc14a, bc14b,
     bc17, bc18, bc19, bc20, bc21, bc22, bc_u2,
     bt2, bt3, bt13, bt14x, bt14y, bt16, bt17, bt18, bt22, tt2, tt3,
     tx1, tx2, tx3, tx4_in, tx4_out, tx5, tx7, tx8, tx9, tx_u2, tx10, tx11, tx12,
     tx13_both, tt13_both, tx13_cat_only, tx13_tag_only, tt13_tag_only, tx13_out, tt13_out,
     tx14a, tt14a, tx14b, tt14b, tx14c, tx14d, tt14d, tx14e, tt14e_x, tt14e_y,
     tx15, tx16, tt16, tx17a, tx17b, tt17b, tx18a, tt18a, tx18b, tx19, tx20, tx21,
     tx22a, tt22a, tx22b, tx22c, tt22c,
     b15;

-- test 10 pre-condition: soft-delete c10 so b10's only link is dead; b10 then has no live links
-- and matches nothing (without that guard it would match all Nov-2025 spend)
update public.categories
set deleted_at = now()
where user_id = tests.get_supabase_uid('bp_u1@test.com') and name = 'bp_c10';

-- test 16 / 17 pre-condition: soft-delete the tags b16 (its only link) and b17 (its tag link) use
update public.tags
set deleted_at = now()
where user_id = tests.get_supabase_uid('bp_u1@test.com') and name in ('and_dead', 'and_dead2');

-- test 18 pre-condition: soft-delete b18's only category
update public.categories
set deleted_at = now()
where user_id = tests.get_supabase_uid('bp_u1@test.com') and name = 'bp_c18';

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

-- 3) Category + tag budget: a transaction satisfying both sets is counted once ($300 not $600)
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'cat-and-tag' $$,
    array[300.00::numeric],
    'budget linking a category and a tag counts a transaction satisfying both sets once'
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

-- 11) Parent-linked budget: transaction filed under a CHILD category still counts
-- (category_hierarchy traversal, not an exact category_id match)
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'parent-category' $$,
    array[150.00::numeric],
    'budget linked to a parent category counts a transaction filed under its child category'
);

-- 12) Budget linked to BOTH a parent and its own child: the child's transaction
-- is a match through two links (the parent's descendant row and the child's own
-- self row), but the match is a single EXISTS predicate per transaction, so it
-- is still counted exactly once (not doubled to 500.00)
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'parent-and-child-dedup' $$,
    array[250.00::numeric],
    'budget linked to both a parent and its own child category does not double-count a child transaction'
);

-- 13) AND between the sets: only the transaction satisfying BOTH the category
-- set and the tag set counts; category-only ($10) and tag-only ($1) matches don't
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'and-cat-tag' $$,
    array[100.00::numeric],
    'budget with categories and tags counts only transactions matching both sets'
);

-- 14) OR within each set, AND between the sets
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'and-multi' $$,
    array[63.00::numeric],
    'any linked category AND any linked tag: 20 + 30 + 13 counted (the transaction carrying both tags once), category-only and tag-only excluded'
);

-- 15) No links at all → matches nothing, even with same-type transactions in the window
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'no-links' $$,
    array[0.00::numeric],
    'budget with no links matches nothing instead of every transaction of its type'
);

-- 16) The only linked tag is soft-deleted → no live links → matches nothing
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'dead-tag-only' $$,
    array[0.00::numeric],
    'budget whose only linked tag is soft-deleted matches nothing instead of widening'
);

-- 16b) the dead link row is still present, i.e. the budget really is "linked to a dead tag"
-- rather than the soft-delete having cascaded into budget_tags
select ok(
    exists (
        select 1
        from public.budget_tags bt
        join public.budgets b on b.id = bt.budget_id
        where b.name = 'dead-tag-only'
    ),
    'soft-deleting a tag leaves the budget_tags row in place (the link is dead, not removed)'
);

-- 17) Liveness is judged per set: a live category plus only a soft-deleted tag → the tag set is
-- empty (no constraint), so the budget falls back to matching by category alone
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'live-cat-dead-tag' $$,
    array[40.00::numeric],
    'live category + soft-deleted tag: matches by category alone'
);

-- 18) Reverse: a soft-deleted category plus a live tag → matches by tag alone
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'dead-cat-live-tag' $$,
    array[60.00::numeric],
    'soft-deleted category + live tag: matches by tag alone'
);

-- 19-21) Open-ended date sides, with boundary dates inclusive
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'open-start' $$,
    array[33.00::numeric],
    'end_date only: unbounded start, end date inclusive'
);
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'open-end' $$,
    array[11.00::numeric],
    'start_date only: unbounded end, start date inclusive'
);
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'open-both' $$,
    array[7.00::numeric],
    'no dates: every matching transaction counts'
);

-- 22) Parent category + tag: a transaction under a child of the linked parent counts only if it
-- also carries the tag
select results_eq(
    $$ select current_amount from public.get_budget_progress() where name = 'parent-and-tag' $$,
    array[70.00::numeric],
    'parent category AND tag: only the child transaction that carries the tag counts'
);

-- 23) The view itself (what the UI reads), not just the wrapper: link counts count LIVE links only,
-- and current_amount agrees with the rule. Ordered with the C collation so the expected
-- order does not depend on the database locale's treatment of hyphens.
select results_eq(
    $$ select name::text, category_count::int, tag_count::int, current_amount
       from public.budgets_with_linked
       where name in ('and-cat-tag', 'and-multi', 'dead-cat-live-tag', 'dead-tag-only',
                      'deleted-cat', 'live-cat-dead-tag', 'no-links', 'parent-and-tag')
       order by name collate "C" $$,
    $$ values
        ('and-cat-tag'::text,       1, 1, 100.00::numeric),
        ('and-multi'::text,         2, 2,  63.00::numeric),
        ('dead-cat-live-tag'::text, 0, 1,  60.00::numeric),
        ('dead-tag-only'::text,     0, 0,   0.00::numeric),
        ('deleted-cat'::text,       0, 0,   0.00::numeric),
        ('live-cat-dead-tag'::text, 1, 0,  40.00::numeric),
        ('no-links'::text,          0, 0,   0.00::numeric),
        ('parent-and-tag'::text,    1, 1,  70.00::numeric) $$,
    'budgets_with_linked: live link counts and current_amount follow the AND rule'
);

-- 24-25) View-level isolation, without the wrapper's own auth.uid() filter
select is_empty(
    $$ select id from public.budgets_with_linked where name = 'u2-budget' $$,
    'budgets_with_linked does not expose another user''s budget'
);
select is_empty(
    $$ select id from public.budgets_with_linked where user_id <> auth.uid() $$,
    'budgets_with_linked returns only the caller''s budgets'
);

select * from finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select tests.create_supabase_user('bd_u1@test.com');
select tests.create_supabase_user('bd_u2@test.com');

-- ── Setup (inserted before authenticate_as, so it bypasses RLS) ──────────────
-- user1, period used throughout: 2026-01-01 .. 2026-02-28 (spend)
--
--   categories: Vacation (parent) > Flights, Hotels;  Food (top level, no children);
--               Old (soft-deleted after use);  Wages (earn)
--   tags: trip, work, gone (soft-deleted after use)
--   accounts: Main, Savings, old-acct (soft-deleted after use)
--
--   t1  2026-01-10 Flights   100  Main      tags trip
--   t2  2026-01-31 Hotels     50  Main      tags trip, work        (inclusive of both ends)
--   t3  2026-02-01 Food       30  Savings   no tags
--   t4  2026-02-28 Flights    20  Savings   tags work
--   t5  2026-03-01 Flights   999  Main      outside the period (after)
--   t6  2025-12-31 Flights   888  Main      outside the period (before)
--   t7  2026-01-15 Wages     777  Main      earn, not spend
--   t8  2026-01-20 Flights   666  Main      soft-deleted transaction
--   t9  2026-02-10 (none)      5  (none)    no category, no account
--   t10 2026-02-11 Old         7  old-acct  tag gone (category, tag and account all soft-deleted)
--   user2 has one spend transaction of 1000 in its own category (isolation).
insert into public.categories (id, user_id, type, name, parent_id) values
  ('bd000000-0000-0000-0000-000000000001', tests.get_supabase_uid('bd_u1@test.com'), 'spend', 'bd_Vacation', null),
  ('bd000000-0000-0000-0000-000000000002', tests.get_supabase_uid('bd_u1@test.com'), 'spend', 'bd_Flights', 'bd000000-0000-0000-0000-000000000001'),
  ('bd000000-0000-0000-0000-000000000003', tests.get_supabase_uid('bd_u1@test.com'), 'spend', 'bd_Hotels',  'bd000000-0000-0000-0000-000000000001'),
  ('bd000000-0000-0000-0000-000000000004', tests.get_supabase_uid('bd_u1@test.com'), 'spend', 'bd_Food', null),
  ('bd000000-0000-0000-0000-000000000005', tests.get_supabase_uid('bd_u1@test.com'), 'spend', 'bd_Old', null),
  ('bd000000-0000-0000-0000-000000000006', tests.get_supabase_uid('bd_u1@test.com'), 'earn',  'bd_Wages', null),
  ('bd000000-0000-0000-0000-000000000007', tests.get_supabase_uid('bd_u2@test.com'), 'spend', 'bd_U2cat', null);

insert into public.tags (id, user_id, name) values
  ('bd100000-0000-0000-0000-000000000001', tests.get_supabase_uid('bd_u1@test.com'), 'bd_trip'),
  ('bd100000-0000-0000-0000-000000000002', tests.get_supabase_uid('bd_u1@test.com'), 'bd_work'),
  ('bd100000-0000-0000-0000-000000000003', tests.get_supabase_uid('bd_u1@test.com'), 'bd_gone');

insert into public.bank_accounts (id, user_id, name) values
  ('bd200000-0000-0000-0000-000000000001', tests.get_supabase_uid('bd_u1@test.com'), 'bd_Main'),
  ('bd200000-0000-0000-0000-000000000002', tests.get_supabase_uid('bd_u1@test.com'), 'bd_Savings'),
  ('bd200000-0000-0000-0000-000000000003', tests.get_supabase_uid('bd_u1@test.com'), 'bd_old-acct');

insert into public.transactions (id, user_id, date, type, amount, category_id, bank_account_id, deleted_at) values
  ('bd300000-0000-0000-0000-000000000001', tests.get_supabase_uid('bd_u1@test.com'), '2026-01-10', 'spend', 100, 'bd000000-0000-0000-0000-000000000002', 'bd200000-0000-0000-0000-000000000001', null),
  ('bd300000-0000-0000-0000-000000000002', tests.get_supabase_uid('bd_u1@test.com'), '2026-01-31', 'spend',  50, 'bd000000-0000-0000-0000-000000000003', 'bd200000-0000-0000-0000-000000000001', null),
  ('bd300000-0000-0000-0000-000000000003', tests.get_supabase_uid('bd_u1@test.com'), '2026-02-01', 'spend',  30, 'bd000000-0000-0000-0000-000000000004', 'bd200000-0000-0000-0000-000000000002', null),
  ('bd300000-0000-0000-0000-000000000004', tests.get_supabase_uid('bd_u1@test.com'), '2026-02-28', 'spend',  20, 'bd000000-0000-0000-0000-000000000002', 'bd200000-0000-0000-0000-000000000002', null),
  ('bd300000-0000-0000-0000-000000000005', tests.get_supabase_uid('bd_u1@test.com'), '2026-03-01', 'spend', 999, 'bd000000-0000-0000-0000-000000000002', 'bd200000-0000-0000-0000-000000000001', null),
  ('bd300000-0000-0000-0000-000000000006', tests.get_supabase_uid('bd_u1@test.com'), '2025-12-31', 'spend', 888, 'bd000000-0000-0000-0000-000000000002', 'bd200000-0000-0000-0000-000000000001', null),
  ('bd300000-0000-0000-0000-000000000007', tests.get_supabase_uid('bd_u1@test.com'), '2026-01-15', 'earn',  777, 'bd000000-0000-0000-0000-000000000006', 'bd200000-0000-0000-0000-000000000001', null),
  ('bd300000-0000-0000-0000-000000000008', tests.get_supabase_uid('bd_u1@test.com'), '2026-01-20', 'spend', 666, 'bd000000-0000-0000-0000-000000000002', 'bd200000-0000-0000-0000-000000000001', now()),
  ('bd300000-0000-0000-0000-000000000009', tests.get_supabase_uid('bd_u1@test.com'), '2026-02-10', 'spend',   5, null, null, null),
  ('bd300000-0000-0000-0000-000000000010', tests.get_supabase_uid('bd_u1@test.com'), '2026-02-11', 'spend',   7, 'bd000000-0000-0000-0000-000000000005', 'bd200000-0000-0000-0000-000000000003', null),
  ('bd300000-0000-0000-0000-000000000011', tests.get_supabase_uid('bd_u2@test.com'), '2026-01-12', 'spend', 1000, 'bd000000-0000-0000-0000-000000000007', null, null);

insert into public.transaction_tags (transaction_id, tag_id) values
  ('bd300000-0000-0000-0000-000000000001', 'bd100000-0000-0000-0000-000000000001'),
  ('bd300000-0000-0000-0000-000000000002', 'bd100000-0000-0000-0000-000000000001'),
  ('bd300000-0000-0000-0000-000000000002', 'bd100000-0000-0000-0000-000000000002'),
  ('bd300000-0000-0000-0000-000000000004', 'bd100000-0000-0000-0000-000000000002'),
  ('bd300000-0000-0000-0000-000000000010', 'bd100000-0000-0000-0000-000000000003');

-- Soft-delete the entities that transactions still point at.
update public.categories    set deleted_at = now() where id = 'bd000000-0000-0000-0000-000000000005';
update public.tags          set deleted_at = now() where id = 'bd100000-0000-0000-0000-000000000003';
update public.bank_accounts set deleted_at = now() where id = 'bd200000-0000-0000-0000-000000000003';

select tests.authenticate_as('bd_u1@test.com');

-- ── get_breakdown: category, leaf mode ───────────────────────────────────────
select results_eq(
  $$ select entity_name, parent_name, total, tx_count
       from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values
       ('bd_Flights'::text, 'bd_Vacation'::text, 120::numeric, 2::bigint),
       ('bd_Hotels',        'bd_Vacation',        50,          1),
       ('bd_Food',          null,                 30,          1),
       ('bd_Old',           null,                  7,          1),
       ('Uncategorised',    null,                  5,          1) $$,
  'category (leaf): ranked by total; inclusive date bounds; soft-deleted category still counted; no-category row'
);

select is(
  (select member_ids from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') where entity_name = 'bd_Flights'),
  array['bd000000-0000-0000-0000-000000000002']::uuid[],
  'category (leaf): member_ids is the category itself'
);

select is(
  (select member_ids from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') where entity_name = 'Uncategorised'),
  null::uuid[],
  'the Uncategorised row has no member_ids (nothing to link to)'
);

select is(
  (select entity_id from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') where entity_name = 'Uncategorised'),
  null::uuid,
  'the Uncategorised row has a NULL entity_id'
);

-- ── get_breakdown: category, group by parent ─────────────────────────────────
select results_eq(
  $$ select entity_name, parent_name, total, tx_count
       from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28', true) $$,
  $$ values
       ('bd_Vacation'::text, null::text, 170::numeric, 3::bigint),
       ('bd_Food',           null,        30,          1),
       ('bd_Old',            null,         7,          1),
       ('Uncategorised',     null,         5,          1) $$,
  'category (group by parent): children roll up; childless top-level categories stay as themselves'
);

select is(
  (select array_length(member_ids, 1) from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28', true) where entity_name = 'bd_Vacation'),
  3,
  'category (group by parent): member_ids is the parent plus its two children'
);

select ok(
  (select member_ids @> array['bd000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000002', 'bd000000-0000-0000-0000-000000000003']::uuid[]
     from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28', true) where entity_name = 'bd_Vacation'),
  'category (group by parent): member_ids contains the parent and both children'
);

-- ── get_breakdown: tag ───────────────────────────────────────────────────────
select results_eq(
  $$ select entity_name, total, tx_count
       from public.get_breakdown('tag', 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values
       ('bd_trip'::text, 150::numeric, 2::bigint),
       ('bd_work',        70,          2),
       ('bd_gone',         7,          1) $$,
  'tag: a multi-tag transaction counts toward each tag; untagged transactions are omitted; soft-deleted tag still counted'
);

-- ── get_breakdown: bank account ──────────────────────────────────────────────
select results_eq(
  $$ select entity_name, total, tx_count
       from public.get_breakdown('bank_account', 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values
       ('bd_Main'::text,     150::numeric, 2::bigint),
       ('bd_Savings',         50,          2),
       ('bd_old-acct',         7,          1),
       ('No account',         5,          1) $$,
  'bank_account: per account; soft-deleted account still counted; no-account row'
);

-- ── get_breakdown: type, period, deleted transactions ────────────────────────
select results_eq(
  $$ select entity_name, total from public.get_breakdown('category', 'earn', '2026-01-01', '2026-02-28') $$,
  $$ values ('bd_Wages'::text, 777::numeric) $$,
  'the type filter picks earn transactions only'
);

select is(
  (select count(*)::int from public.get_breakdown('category', 'spend', '2026-03-01', '2026-03-01')),
  1,
  'a one-day period includes that day (the 2026-03-01 transaction)'
);

select is(
  (select total from public.get_breakdown('category', 'spend', '2026-03-01', '2026-03-01')),
  999::numeric,
  'a one-day period returns only that day''s amount'
);

select is(
  (select count(*)::int from public.get_breakdown('category', 'spend', '2026-02-28', '2026-01-01')),
  0,
  'an inverted period returns no rows'
);

select is(
  (select coalesce(sum(total), 0) from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') where total = 666),
  0::numeric,
  'a soft-deleted transaction is never counted'
);

-- ── isolation ────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') where entity_name = 'bd_U2cat'),
  0,
  'another user''s categories are not visible'
);

-- ── get_breakdown_monthly ────────────────────────────────────────────────────
select results_eq(
  $$ select month, total, tx_count
       from public.get_breakdown_monthly('category', 'bd000000-0000-0000-0000-000000000002', 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values ('2026-01-01'::date, 100::numeric, 1::bigint), ('2026-02-01'::date, 20::numeric, 1::bigint) $$,
  'monthly (leaf category): one row per month with transactions, inclusive of the last day'
);

select results_eq(
  $$ select month, total, tx_count
       from public.get_breakdown_monthly('category', 'bd000000-0000-0000-0000-000000000001', 'spend', '2026-01-01', '2026-02-28', true) $$,
  $$ values ('2026-01-01'::date, 150::numeric, 2::bigint), ('2026-02-01'::date, 20::numeric, 1::bigint) $$,
  'monthly (parent mode): the parent includes its children'
);

select results_eq(
  $$ select month, total, tx_count
       from public.get_breakdown_monthly('tag', 'bd100000-0000-0000-0000-000000000001', 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values ('2026-01-01'::date, 150::numeric, 2::bigint) $$,
  'monthly (tag): only months that have a matching transaction appear'
);

select results_eq(
  $$ select month, total, tx_count
       from public.get_breakdown_monthly('bank_account', null, 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values ('2026-02-01'::date, 5::numeric, 1::bigint) $$,
  'monthly (NULL entity): selects the No account row'
);

select is(
  (select sum(total) from public.get_breakdown_monthly('bank_account', 'bd200000-0000-0000-0000-000000000001', 'spend', '2026-01-01', '2026-02-28')),
  (select total from public.get_breakdown('bank_account', 'spend', '2026-01-01', '2026-02-28') where entity_name = 'bd_Main'),
  'monthly totals add up to the ranked-list total for the same entity (shared matching rules)'
);

-- ── errors and grants ────────────────────────────────────────────────────────
select throws_ok(
  $$ select * from public.get_breakdown('payee', 'spend', '2026-01-01', '2026-02-28') $$,
  'P0001',
  'breakdown: unknown dimension payee',
  'get_breakdown rejects an unknown dimension'
);

select throws_ok(
  $$ select * from public.get_breakdown_monthly('payee', null, 'spend', '2026-01-01', '2026-02-28') $$,
  'P0001',
  'breakdown: unknown dimension payee',
  'get_breakdown_monthly rejects an unknown dimension'
);

select throws_ok(
  $$ select * from public.get_breakdown(null, 'spend', '2026-01-01', '2026-02-28') $$,
  'P0001',
  'breakdown: unknown dimension <null>',
  'a NULL dimension is rejected too'
);

-- ── user2 sees only their own ────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('bd_u2@test.com');

select results_eq(
  $$ select entity_name, total from public.get_breakdown('category', 'spend', '2026-01-01', '2026-02-28') $$,
  $$ values ('bd_U2cat'::text, 1000::numeric) $$,
  'user2 sees only their own data'
);

select is(
  (select count(*)::int from public.get_breakdown('tag', 'spend', '2026-01-01', '2026-02-28')),
  0,
  'user2 has no tagged transactions, and none of user1''s tags leak'
);

-- ── grants ───────────────────────────────────────────────────────────────────
select tests.clear_authentication();

select ok(
  not has_function_privilege('anon', 'public.get_breakdown(text, public.transaction_type, date, date, boolean)', 'execute'),
  'anon cannot execute get_breakdown'
);

select ok(
  has_function_privilege('authenticated', 'public.get_breakdown_monthly(text, uuid, public.transaction_type, date, date, boolean)', 'execute'),
  'authenticated can execute get_breakdown_monthly'
);

select * from finish();

rollback;

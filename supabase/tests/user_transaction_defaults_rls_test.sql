begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Scratch table for passing ids between the two authenticated sessions below.
-- Created as postgres before any authenticate_as, then opened up so both test
-- roles can write to it.
create temporary table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

select tests.create_supabase_user('utd_user1@test.com');
select tests.create_supabase_user('utd_user2@test.com');

-- ── Fixtures ──────────────────────────────────────────────────────────────────

select tests.authenticate_as('utd_user1@test.com');

insert into public.categories (type, name) values
  ('spend'::public.transaction_type, 'Groceries'),
  ('earn'::public.transaction_type, 'Salary'),
  ('spend'::public.transaction_type, 'Doomed');
insert into public.bank_accounts (name) values ('Checking'), ('DoomedBank');

insert into t_ids (k, v)
select 'u1_groceries', id from public.categories where name = 'Groceries';
insert into t_ids (k, v)
select 'u1_salary', id from public.categories where name = 'Salary';
insert into t_ids (k, v)
select 'u1_doomed_cat', id from public.categories where name = 'Doomed';
insert into t_ids (k, v)
select 'u1_checking', id from public.bank_accounts where name = 'Checking';
insert into t_ids (k, v)
select 'u1_doomed_bank', id from public.bank_accounts where name = 'DoomedBank';

select tests.authenticate_as('utd_user2@test.com');

insert into public.categories (type, name) values ('spend'::public.transaction_type, 'Transport');
insert into public.bank_accounts (name) values ('Monzo');

insert into t_ids (k, v)
select 'u2_transport', id from public.categories where name = 'Transport';
insert into t_ids (k, v)
select 'u2_monzo', id from public.bank_accounts where name = 'Monzo';

-- User 2 gets a defaults row of their own, so the reset isolation check at the
-- end has something to assert survived.
insert into public.user_transaction_defaults (type, category_id, bank_account_id)
select 'spend'::public.transaction_type,
       (select v from t_ids where k = 'u2_transport'),
       (select v from t_ids where k = 'u2_monzo');

-- ── Happy path ────────────────────────────────────────────────────────────────

select tests.authenticate_as('utd_user1@test.com');

-- 1) user_id is supplied by the set_user_id trigger, not the client
select lives_ok(
    $$ insert into public.user_transaction_defaults (type, category_id, bank_account_id)
       select 'spend'::public.transaction_type,
              (select v from t_ids where k = 'u1_groceries'),
              (select v from t_ids where k = 'u1_checking') $$,
    'User 1 can insert a default without supplying user_id'
);

-- 2) The row reads back scoped to the inserting user
select results_eq(
    $$ select type, category_id, bank_account_id from public.user_transaction_defaults $$,
    $$ select 'spend'::public.transaction_type,
              (select v from t_ids where k = 'u1_groceries'),
              (select v from t_ids where k = 'u1_checking') $$,
    'User 1 reads back their own default'
);

-- 3) (user_id, type) is the conflict target the app upserts on
select lives_ok(
    $$ insert into public.user_transaction_defaults (type, category_id, bank_account_id)
       select 'spend'::public.transaction_type,
              (select v from t_ids where k = 'u1_groceries'),
              (select v from t_ids where k = 'u1_doomed_bank')
       on conflict (user_id, type) do update
         set category_id = excluded.category_id,
             bank_account_id = excluded.bank_account_id $$,
    'Upsert on (user_id, type) replaces an existing default'
);

-- 4)
select ok(
    (select updated_at >= created_at from public.user_transaction_defaults),
    'updated_at is greater than or equal to created_at after upsert'
);

-- 5) Clearing a default is allowed — both columns are nullable
select lives_ok(
    $$ insert into public.user_transaction_defaults (type, category_id, bank_account_id)
       values ('spend'::public.transaction_type, null, null)
       on conflict (user_id, type) do update
         set category_id = null, bank_account_id = null $$,
    'A default can be cleared back to NULL'
);

-- ── Referential validation ────────────────────────────────────────────────────

-- 6) The category's type must match the row's type
select throws_ok(
    $$ insert into public.user_transaction_defaults (type, category_id)
       select 'earn'::public.transaction_type,
              (select v from t_ids where k = 'u1_groceries') $$,
    '23514',
    null,
    'A spend category is rejected as the earn default'
);

-- 7) Soft-deleted rows must not be storable as a default
update public.categories set deleted_at = now()
 where id = (select v from t_ids where k = 'u1_doomed_cat');

select throws_ok(
    $$ insert into public.user_transaction_defaults (type, category_id)
       select 'save'::public.transaction_type,
              (select v from t_ids where k = 'u1_doomed_cat') $$,
    '23514',
    null,
    'A soft-deleted category is rejected as a default'
);

-- 8)
update public.bank_accounts set deleted_at = now()
 where id = (select v from t_ids where k = 'u1_doomed_bank');

select throws_ok(
    $$ insert into public.user_transaction_defaults (type, bank_account_id)
       select 'save'::public.transaction_type,
              (select v from t_ids where k = 'u1_doomed_bank') $$,
    '23514',
    null,
    'A soft-deleted bank account is rejected as a default'
);

-- 9) Cross-user references are rejected — the FK alone would happily accept these
select throws_ok(
    $$ insert into public.user_transaction_defaults (type, category_id)
       select 'save'::public.transaction_type,
              (select v from t_ids where k = 'u2_transport') $$,
    '23514',
    null,
    'Another user''s category is rejected as a default'
);

-- 10)
select throws_ok(
    $$ insert into public.user_transaction_defaults (type, bank_account_id)
       select 'save'::public.transaction_type,
              (select v from t_ids where k = 'u2_monzo') $$,
    '23514',
    null,
    'Another user''s bank account is rejected as a default'
);

-- ── RLS isolation ─────────────────────────────────────────────────────────────

select tests.authenticate_as('utd_user2@test.com');

-- 11) User 2 sees only their own row, not User 1's
select results_eq(
    $$ select count(*) from public.user_transaction_defaults $$,
    array[1::bigint],
    'User 2 cannot see User 1 defaults'
);

-- 12) ...and cannot reach User 1's row to update it
select is_empty(
    $$ update public.user_transaction_defaults set category_id = null
        where user_id <> (select auth.uid()) returning 1 $$,
    'User 2 cannot update User 1 defaults'
);

-- ── Default transaction type on user_settings ─────────────────────────────────

select tests.authenticate_as('utd_user1@test.com');

-- 13)
select lives_ok(
    $$ insert into public.user_settings (currency, default_transaction_type)
       values ('GBP', 'spend'::public.transaction_type)
       on conflict (user_id) do update
         set default_transaction_type = 'spend'::public.transaction_type $$,
    'default_transaction_type accepts a valid transaction type'
);

-- ── reset_user_data clears the preferences too ────────────────────────────────

select public.reset_user_data();

-- 14)
select is(
    (select count(*) from public.user_transaction_defaults),
    0::bigint,
    'reset_user_data clears User 1 transaction defaults'
);

-- 15)
select is(
    (select default_transaction_type from public.user_settings),
    null::public.transaction_type,
    'reset_user_data clears User 1 default transaction type'
);

-- 16) User 2's preferences are untouched by User 1's reset
select tests.authenticate_as('utd_user2@test.com');

select results_eq(
    $$ select count(*) from public.user_transaction_defaults $$,
    array[1::bigint],
    'User 2 defaults survive User 1 reset'
);

select * from finish();

rollback;

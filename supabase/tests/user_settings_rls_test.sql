begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Create two test users
select tests.create_supabase_user('us_user1@test.com');
select tests.create_supabase_user('us_user2@test.com');

-- ── User 1 ────────────────────────────────────────────────────────────────────

select tests.authenticate_as('us_user1@test.com');

-- 1) User 1 can insert settings without supplying user_id (trigger sets it)
select lives_ok(
    $$ insert into public.user_settings (currency) values ('GBP') $$,
    'User 1 can insert settings without explicit user_id'
);

-- 2) User 1 can read their own settings
select results_eq(
    $$ select currency from public.user_settings $$,
    $$ values ('GBP') $$,
    'User 1 sees their own settings'
);

-- 3) User 1 can update their currency
select lives_ok(
    $$ update public.user_settings set currency = 'EUR' $$,
    'User 1 can update their currency'
);

-- 4) updated_at advances after update
select ok(
    (select updated_at >= created_at from public.user_settings),
    'updated_at is greater than or equal to created_at after update'
);

-- ── User 2 ────────────────────────────────────────────────────────────────────

select tests.authenticate_as('us_user2@test.com');

-- 5) User 2 sees no rows (User 1's settings are hidden)
select results_eq(
    $$ select count(*) from public.user_settings $$,
    array[0::bigint],
    'User 2 cannot see User 1 settings'
);

-- 6) User 2 can insert their own settings
select lives_ok(
    $$ insert into public.user_settings (currency) values ('USD') $$,
    'User 2 can insert their own settings'
);

-- 7) User 2 cannot update User 1's row (0 rows affected due to RLS)
select is_empty(
    $$ update public.user_settings set currency = 'JPY' where currency = 'EUR' returning 1 $$,
    'User 2 cannot update User 1 settings'
);

-- ── Constraints ───────────────────────────────────────────────────────────────

select tests.authenticate_as('us_user1@test.com');

-- 8) CHECK rejects currency shorter than 3 chars
select throws_ok(
    $$ insert into public.user_settings (currency) values ('US') on conflict (user_id) do update set currency = 'US' $$,
    '23514',
    null,
    'CHECK rejects currency shorter than 3 chars'
);

-- 9) CHECK rejects currency longer than 3 chars
select throws_ok(
    $$ insert into public.user_settings (currency) values ('USDD') on conflict (user_id) do update set currency = 'USDD' $$,
    '23514',
    null,
    'CHECK rejects currency longer than 3 chars'
);

-- 10) Valid 3-char currency is accepted
select lives_ok(
    $$ insert into public.user_settings (currency) values ('JPY') on conflict (user_id) do update set currency = 'JPY' $$,
    'Valid 3-char currency is accepted'
);

select * from finish();

rollback;

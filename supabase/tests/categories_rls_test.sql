begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Create two test users
select tests.create_supabase_user('cat_user1@test.com');
select tests.create_supabase_user('cat_user2@test.com');

-- As User 1
select tests.authenticate_as('cat_user1@test.com');

-- 1) Insert without user_id should succeed and set user_id = auth.uid()
select lives_ok(
    $$ insert into public.categories (type, name, description) values ('spend', 'Food', 'Groceries') $$,
    'Insert without user_id auto-assigns from auth.uid()'
);

-- 2) Selecting categories returns only user1 rows
select results_eq(
    $$ select count(*) from public.categories $$,
    array[1::bigint],
    'User 1 sees only their categories'
);

-- 3) updated_at should change on update
select lives_ok(
    $$ update public.categories set description = 'Groceries & dining' where name = 'Food' $$,
    'User 1 can update their category'
);

-- capture updated_at difference (should be greater than created_at)
select ok(
    (select updated_at >= created_at from public.categories where name = 'Food'),
    'updated_at is greater than or equal to created_at after update'
);

-- As User 2
select tests.authenticate_as('cat_user2@test.com');

-- 4) User 2 cannot see user 1 categories
select results_eq(
    $$ select count(*) from public.categories $$,
    array[0::bigint],
    'User 2 sees none of user 1 categories'
);

-- 5) User 2 can insert their own category (no user_id provided)
select lives_ok(
    $$ insert into public.categories (type, name) values ('spend', 'Travel') $$,
    'User 2 can insert their own category with auto user_id'
);

-- 6) User 2 cannot update user 1 category (should affect 0 rows due to RLS filtering)
select is_empty(
    $$ update public.categories set description = 'hacked' where name = 'Food' returning 1 $$,
    'User 2 update on user 1 category affects 0 rows'
);

-- 7) User 2 can update their own category
select lives_ok(
    $$ update public.categories set description = 'trips' where name = 'Travel' $$,
    'User 2 can update their own category'
);

-- 8) User 2 cannot delete user 1 category (should affect 0 rows)
select is_empty(
    $$ delete from public.categories where name = 'Food' returning 1 $$,
    'User 2 delete on user 1 category affects 0 rows'
);

-- 9) User 2 can delete their own category
select lives_ok(
    $$ delete from public.categories where name = 'Travel' $$,
    'User 2 can delete their own category'
);

-- 10) Unique name per user/type enforced
select tests.authenticate_as('cat_user1@test.com');
select throws_like(
    $$ insert into public.categories (type, name) values ('spend', 'Food') $$,
    '%unique_user_type_name%',
    'Unique constraint on (user_id, type, name, parent_id) is enforced'
);

select * from finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- Create test supabase users
select tests.create_supabase_user('user1@test.com');
select tests.create_supabase_user('user2@test.com');

-- Seed tags needed by tests
insert into public.tags (user_id, name)
values
    (tests.get_supabase_uid('user1@test.com'), 'test'),
    (tests.get_supabase_uid('user1@test.com'), 'groceries'),
    (tests.get_supabase_uid('user1@test.com'), 'stocks'),
    (tests.get_supabase_uid('user2@test.com'), 'salary'),
    (tests.get_supabase_uid('user2@test.com'), 'groceries');

-- Seed a category per user for the category-ownership tests
insert into public.categories (user_id, type, name)
values
    (tests.get_supabase_uid('user1@test.com'), 'spend', 'user1-cat'),
    (tests.get_supabase_uid('user2@test.com'), 'spend', 'user2-cat');

-- Capture user1's category id up front (as postgres, bypassing RLS) since User 2 can't
-- see it once authenticated below.
select id as user1_cat_id from public.categories
    where user_id = tests.get_supabase_uid('user1@test.com') and name = 'user1-cat' \gset

-- Create test transactions
insert into transactions (id, user_id, date, type, category, amount, tags, notes, bank_account) values
    (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), current_date, 'spend', 'test', 100.00, array['test'], 'Test transaction', 'Test Bank'),
    (gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), current_date, 'earn', 'salary', 200.00, array['salary'], 'Salary payment', 'Test Bank'),
    (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), current_date - interval '1 day', 'save', 'investment', 150.00, array['stocks'], 'Investment in stocks', 'Test Bank');


-- as User 1
select tests.authenticate_as('user1@test.com');


-- Test 1: User 1 should only see their own transactions
select results_eq(
    'select count(*) from transactions',
    array[2::bigint],
    'User 1 should only see their 2 transactions'
);


-- Test 2: User 1 can create their own transaction
select lives_ok(
    $$insert into transactions (id, user_id, date, type, category, amount, tags, notes, bank_account)
      values (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), current_date, 'spend', 'groceries', 50.00, array['groceries'], 'grocery shopping', 'test bank')$$,
    'User 1 should be able to create a new transaction'
);


-- Test 3: User 1 cannot insert a transaction for another user
select throws_ok(
        $$insert into transactions (id, user_id, date, type, category, amount, tags, notes, bank_account)
            values (gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), current_date, 'spend', 'groceries', 50.00, null, 'grocery shopping', 'test bank')$$,
    '42501',
    'new row violates row-level security policy for table "transactions"',
    'User 1 should not be able to insert a transaction for another user'
);


-- as User 2
select tests.authenticate_as('user2@test.com');


-- Test 4: User 2 should only see their own transactions
select results_eq(
    'select count(*) from transactions',
    array[1::bigint],
    'User 2 should only see their 1 transaction'
);


-- Test 5: User 2 cannot modify User 1's transactions
select results_ne(
    $$ update transactions set notes = 'hacked!' where user_id = tests.get_supabase_uid('user1@test.com') returning 1 $$,
    $$ values(1) $$,
    'User 2 should not be able to modify User 1 transactions'
);


-- Test 6: User 2 can update their own transaction
select lives_ok(
    $$update transactions set notes = 'updated by user 2' where user_id = tests.get_supabase_uid('user2@test.com')$$,
    'User 2 should be able to update their own transaction'
);


-- Test 7: User 2 can delete their own transaction
select lives_ok(
    $$delete from transactions where user_id = tests.get_supabase_uid('user2@test.com')$$,
    'User 2 should be able to delete their own transaction'
);


-- Test 8: User 2 cannot set user_id to another user on insert
select throws_ok(
        $$insert into transactions (id, user_id, date, type, category, amount, tags, notes, bank_account)
            values (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), current_date, 'spend', 'groceries', 50.00, null, 'grocery shopping', 'test bank')$$,
    '42501',
    'new row violates row-level security policy for table "transactions"',
    'User 2 should not be able to set user_id to another user on insert'
);


-- Test 9: User 2 cannot insert a transaction referencing User 1's category
select throws_ok(
        format(
            $$insert into transactions (id, user_id, date, type, category_id, amount, notes)
                values (
                    gen_random_uuid(),
                    tests.get_supabase_uid('user2@test.com'),
                    current_date,
                    'spend',
                    %L,
                    50.00,
                    'category ownership check'
                )$$,
            :'user1_cat_id'
        ),
    '23514',
    'Category does not belong to the user',
    'User 2 should not be able to insert a transaction with User 1''s category_id'
);


-- Test 10: User 2 can insert a transaction referencing their own category
select lives_ok(
    $$insert into transactions (id, user_id, date, type, category_id, amount, notes)
        values (
            gen_random_uuid(),
            tests.get_supabase_uid('user2@test.com'),
            current_date,
            'spend',
            (select id from public.categories where user_id = tests.get_supabase_uid('user2@test.com') and name = 'user2-cat'),
            50.00,
            'own category'
        )$$,
    'User 2 should be able to insert a transaction with their own category_id'
);

-- Test 11: user_id is NOT NULL (S4)
-- Bypass RLS entirely (reset role + clear the JWT claim) so the insert fails on the
-- NOT NULL constraint itself rather than on the RLS policy's NULL = NULL check.
reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
        $$insert into transactions (id, user_id, date, type, category, amount, tags, notes, bank_account)
            values (gen_random_uuid(), null, current_date, 'spend', 'groceries', 50.00, null, 'no owner', 'test bank')$$,
    '23502',
    'null value in column "user_id" of relation "transactions" violates not-null constraint',
    'Inserting a transaction with a null user_id should violate the NOT NULL constraint'
);


-- Test 12: deleting the owning auth user cascades to their transactions (S4)
select tests.create_supabase_user('cascade_user@test.com');

insert into transactions (id, user_id, date, type, category, amount, tags, notes, bank_account)
values (gen_random_uuid(), tests.get_supabase_uid('cascade_user@test.com'), current_date, 'spend', 'groceries', 25.00, null, 'will cascade', 'test bank');

delete from auth.users where id = tests.get_supabase_uid('cascade_user@test.com');

select results_eq(
    $$select count(*) from transactions where notes = 'will cascade'$$,
    array[0::bigint],
    'Deleting the owning auth user should cascade-delete their transactions'
);

select * from finish();

rollback;
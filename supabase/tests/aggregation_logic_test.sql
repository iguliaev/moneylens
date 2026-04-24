begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Create test supabase users
select tests.create_supabase_user('user1@test.com');
select tests.create_supabase_user('user2@test.com');


-- Seed required tags for each user to satisfy enforce_known_tags trigger
insert into public.tags (user_id, name)
values
  (tests.get_supabase_uid('user1@test.com'), 'groceries'),
  (tests.get_supabase_uid('user1@test.com'), 'salary'),
  (tests.get_supabase_uid('user2@test.com'), 'groceries'),
  (tests.get_supabase_uid('user2@test.com'), 'salary');


-- Insert test categories for each user and type, and use CTEs to reference their IDs
WITH
  cat_food_user1 AS (
    INSERT INTO categories (id, user_id, type, name, description, created_at, updated_at)
    VALUES (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'spend', 'food', 'Food', now(), now())
    RETURNING id
  ),
  cat_salary_user1 AS (
    INSERT INTO categories (id, user_id, type, name, description, created_at, updated_at)
    VALUES (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'earn', 'salary', 'Salary', now(), now())
    RETURNING id
  ),
  cat_vacation_user1 AS (
    INSERT INTO categories (id, user_id, type, name, description, created_at, updated_at)
    VALUES (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'save', 'vacation', 'Vacation', now(), now())
    RETURNING id
  ),
  cat_food_user2 AS (
    INSERT INTO categories (id, user_id, type, name, description, created_at, updated_at)
    VALUES (gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), 'spend', 'food', 'Food', now(), now())
    RETURNING id
  ),
  cat_salary_user2 AS (
    INSERT INTO categories (id, user_id, type, name, description, created_at, updated_at)
    VALUES (gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), 'earn', 'salary', 'Salary', now(), now())
    RETURNING id
  ),
  cat_vacation_user2 AS (
    INSERT INTO categories (id, user_id, type, name, description, created_at, updated_at)
    VALUES (gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), 'save', 'vacation', 'Vacation', now(), now())
    RETURNING id
  ),
  txn_data AS (
    INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account)
    (
    SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-08-01'::date, 'spend'::transaction_type, cat_food_user1.id, 100.00, 'Lunch', 'Test Bank' FROM cat_food_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-08-02'::date, 'spend'::transaction_type, cat_food_user1.id, 50.00, 'Dinner', 'Test Bank' FROM cat_food_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-08-03'::date, 'earn'::transaction_type, cat_salary_user1.id, 1000.00, 'August Salary', 'Test Bank' FROM cat_salary_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-08-04'::date, 'save'::transaction_type, cat_vacation_user1.id, 150.00, 'Vacation', 'Test Bank' FROM cat_vacation_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-07-01'::date, 'spend'::transaction_type, cat_food_user1.id, 100.00, 'Lunch', 'Test Bank' FROM cat_food_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-06-02'::date, 'spend'::transaction_type, cat_food_user1.id, 50.00, 'Dinner', 'Test Bank' FROM cat_food_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-05-03'::date, 'earn'::transaction_type, cat_salary_user1.id, 1000.00, 'August Salary', 'Test Bank' FROM cat_salary_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-04-03'::date, 'earn'::transaction_type, cat_salary_user1.id, 1000.00, 'May Salary', 'Test Bank' FROM cat_salary_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2025-04-04'::date, 'save'::transaction_type, cat_vacation_user1.id, 150.00, 'Vacation', 'Test Bank' FROM cat_vacation_user1
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), '2025-08-01'::date, 'spend'::transaction_type, cat_food_user2.id, 200.00, 'Lunch', 'Test Bank' FROM cat_food_user2
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), '2025-08-02'::date, 'spend'::transaction_type, cat_food_user2.id, 100.00, 'Dinner', 'Test Bank' FROM cat_food_user2
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), '2025-08-03'::date, 'earn'::transaction_type, cat_salary_user2.id, 2000.00, 'August Salary', 'Test Bank' FROM cat_salary_user2
    UNION ALL SELECT gen_random_uuid(), tests.get_supabase_uid('user2@test.com'), '2025-08-04'::date, 'save'::transaction_type, cat_vacation_user2.id, 150.00, 'Vacation', 'Test Bank' FROM cat_vacation_user2
    )
    RETURNING id, user_id, notes
  )
INSERT INTO transaction_tags (transaction_id, tag_id)
SELECT 
  t.id,
  tag.id
FROM txn_data t
JOIN tags tag ON tag.user_id = t.user_id
WHERE 
  (t.notes LIKE '%Lunch%' OR t.notes LIKE '%Dinner%' OR t.notes LIKE '%Vacation%') AND tag.name = 'groceries'
  OR (t.notes LIKE '%Salary%') AND tag.name = 'salary';


-- Additional test data for edge-case tests (tests 12-14)

-- Test 12: insert a transaction in 2024-03, tag it with groceries, then soft-delete it
INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account)
SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2024-03-15'::date, 'spend'::transaction_type, c.id, 45.00, 'SoftDelTest', 'Test Bank'
FROM public.categories c
WHERE c.user_id = tests.get_supabase_uid('user1@test.com') AND c.name = 'food' AND c.deleted_at IS NULL;

INSERT INTO transaction_tags (transaction_id, tag_id)
SELECT t.id, tg.id
FROM public.transactions t
CROSS JOIN public.tags tg
WHERE t.notes = 'SoftDelTest'
  AND t.user_id = tests.get_supabase_uid('user1@test.com')
  AND tg.user_id = tests.get_supabase_uid('user1@test.com')
  AND tg.name = 'groceries';

UPDATE public.transactions SET deleted_at = NOW()
WHERE notes = 'SoftDelTest'
  AND user_id = tests.get_supabase_uid('user1@test.com');

-- Test 13: untagged transaction in 2024-02 (no transaction_tags row)
INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account)
SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2024-02-01'::date, 'spend'::transaction_type, c.id, 30.00, 'UntaggedTest', 'Test Bank'
FROM public.categories c
WHERE c.user_id = tests.get_supabase_uid('user1@test.com') AND c.name = 'food' AND c.deleted_at IS NULL;

-- Test 14: transaction tagged with BOTH groceries AND salary in 2024-01
WITH multi_tag_tx AS (
    INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account)
    SELECT gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), '2024-01-15'::date, 'spend'::transaction_type, c.id, 75.00, 'MultiTagTest', 'Test Bank'
    FROM public.categories c
    WHERE c.user_id = tests.get_supabase_uid('user1@test.com') AND c.name = 'food' AND c.deleted_at IS NULL
    RETURNING id
)
INSERT INTO transaction_tags (transaction_id, tag_id)
SELECT mt.id, tg.id
FROM multi_tag_tx mt, public.tags tg
WHERE tg.user_id = tests.get_supabase_uid('user1@test.com') AND tg.name IN ('groceries', 'salary');


-- as User 1
select tests.authenticate_as('user1@test.com');

-- Test 1: view_monthly_totals for August 2025, type 'spend'
select results_eq(
    $$ select total from view_monthly_totals where user_id = tests.get_supabase_uid('user1@test.com') and month = '2025-08-01' and type = 'spend' $$,
    array[150.00::numeric],
    'view_monthly_totals returns correct sum for August 2025, spend'
);

-- Test 2: view_monthly_totals for August 2025, type 'earn'
select results_eq(
    $$ select total from view_monthly_totals where user_id = tests.get_supabase_uid('user1@test.com') and month = '2025-08-01' and type = 'earn' $$,
    array[1000.00::numeric],
    'view_monthly_totals returns correct sum for August 2025, earn'
);

-- Test 3: view_monthly_totals for August 2025, type 'save'
select results_eq(
    $$ select total from view_monthly_totals where user_id = tests.get_supabase_uid('user1@test.com') and month = '2025-08-01' and type = 'save' $$,
    array[150.00::numeric],
    'view_monthly_totals returns correct sum for August 2025, save'
);

-- Test 4: view_yearly_totals for 2025, type 'spend'
select results_eq(
    $$ select total from view_yearly_totals where user_id = tests.get_supabase_uid('user1@test.com') and year = '2025-01-01' and type = 'spend' $$,
    array[300.00::numeric],
    'view_yearly_totals returns correct sum for 2025, spend'
);

-- Test 5: view_yearly_totals for 2025, type 'earn'
select results_eq(
    $$ select total from view_yearly_totals where user_id = tests.get_supabase_uid('user1@test.com') and year = '2025-01-01' and type = 'earn' $$,
    array[3000.00::numeric],
    'view_yearly_totals returns correct sum for 2025, earn'
);

-- Test 6: view_yearly_totals for 2025, type 'save'
select results_eq(
    $$ select total from view_yearly_totals where user_id = tests.get_supabase_uid('user1@test.com') and year = '2025-01-01' and type = 'save' $$,
    array[300.00::numeric],
    'view_yearly_totals returns correct sum for 2025, save'
);

-- Test 7: view_monthly_category_totals for August 2025, user1
select results_eq(
    $$
    select category, type::text as type, total
    from view_monthly_category_totals
    where user_id = tests.get_supabase_uid('user1@test.com') and month = '2025-08-01'
    order by category, type
    $$,
    $$
    select * from (values
      ('food'::text, 'spend'::text, 150.00::numeric),
      ('salary'::text, 'earn'::text, 1000.00::numeric),
      ('vacation'::text, 'save'::text, 150.00::numeric)
    ) as t(category, type, total)
    order by category, type
    $$,
    'view_monthly_category_totals returns correct per-category sums for August 2025, user1'
);

-- Test 8: view_yearly_category_totals for 2025, user1
select results_eq(
    $$
    select category, type::text as type, total
    from view_yearly_category_totals
    where user_id = tests.get_supabase_uid('user1@test.com') and year = '2025-01-01'
    order by category, type
    $$,
    $$
    select * from (values
      ('food'::text, 'spend'::text, 300.00::numeric),
      ('salary'::text, 'earn'::text, 3000.00::numeric),
      ('vacation'::text, 'save'::text, 300.00::numeric)
    ) as t(category, type, total)
    order by category, type
    $$,
    'view_yearly_category_totals returns correct per-category sums for 2025, user1'
);

-- Test 9: view_monthly_tagged_type_totals for August 2025, user1, tag groceries
select results_eq(
    $$
    select type::text as type, tags, total
    from view_monthly_tagged_type_totals
    where user_id = tests.get_supabase_uid('user1@test.com') and month = '2025-08-01' and 'groceries' = any(tags)
    order by type, tags::text
    $$,
    $$
    select * from (values
      ('save'::text, array['groceries']::text[], 150.00::numeric),
      ('spend'::text, array['groceries']::text[], 150.00::numeric)
    ) as t(type, tags, total)
    order by type, tags::text
    $$,
    'view_monthly_tagged_type_totals returns correct totals for groceries tag in August 2025, user1'
);

-- Test 10: view_yearly_tagged_type_totals for 2025, user1, tag groceries
select results_eq(
    $$
    select type::text as type, tags, total
    from view_yearly_tagged_type_totals
    where user_id = tests.get_supabase_uid('user1@test.com') and year = '2025-01-01' and 'groceries' = any(tags)
    order by type, tags::text
    $$,
    $$
    select * from (values
      ('save'::text, array['groceries']::text[], 300.00::numeric),
      ('spend'::text, array['groceries']::text[], 300.00::numeric)
    ) as t(type, tags, total)
    order by type, tags::text
    $$,
    'view_yearly_tagged_type_totals returns correct totals for groceries tag in 2025, user1'
);

-- Test 11: view_tagged_type_totals across all time, user1
select results_eq(
    $$
    select type::text as type, tags, total
    from view_tagged_type_totals
    where user_id = tests.get_supabase_uid('user1@test.com')
    order by type, tags::text
    $$,
    $$
    select * from (values
      ('earn'::text, array['salary']::text[], 3000.00::numeric),
      ('save'::text, array['groceries']::text[], 300.00::numeric),
      ('spend'::text, array['groceries']::text[], 300.00::numeric),
      ('spend'::text, array['groceries', 'salary']::text[], 75.00::numeric)
    ) as t(type, tags, total)
    order by type, tags::text
    $$,
    'view_tagged_type_totals returns correct totals per type and tag array across all time, user1'
);


-- Test 12: soft-deleted transaction should NOT appear in view_monthly_tagged_type_totals
select is(
    (SELECT COUNT(*)::integer FROM view_monthly_tagged_type_totals
     WHERE user_id = tests.get_supabase_uid('user1@test.com') AND month = '2024-03-01'),
    0,
    'soft-deleted transaction does not appear in view_monthly_tagged_type_totals'
);

-- Test 13: untagged transaction should NOT appear in view_monthly_tagged_type_totals
select is(
    (SELECT COUNT(*)::integer FROM view_monthly_tagged_type_totals
     WHERE user_id = tests.get_supabase_uid('user1@test.com') AND month = '2024-02-01'),
    0,
    'untagged transaction does not appear in view_monthly_tagged_type_totals'
);

-- Test 14: multi-tagged transaction appears as single row with combined tags array
select results_eq(
    $$
    select type::text as type, tags, total
    from view_monthly_tagged_type_totals
    where user_id = tests.get_supabase_uid('user1@test.com') and month = '2024-01-01'
    order by type, tags::text
    $$,
    $$
    select * from (values
      ('spend'::text, array['groceries', 'salary']::text[], 75.00::numeric)
    ) as t(type, tags, total)
    $$,
    'multi-tagged transaction appears as single row with combined tags in view_monthly_tagged_type_totals'
);


select * from finish();
rollback;

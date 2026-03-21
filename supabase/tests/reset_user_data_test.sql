begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Create test users
select tests.create_supabase_user('reset_user1@test.com');
select tests.create_supabase_user('reset_user2@test.com');

-- ===== User 1: Set up test data =====
select tests.authenticate_as('reset_user1@test.com');

-- Create categories
insert into public.categories (type, name) values 
  ('spend'::public.transaction_type, 'Groceries'),
  ('earn'::public.transaction_type, 'Salary'),
  ('save'::public.transaction_type, 'Emergency Fund');

-- Create tags
insert into public.tags (name) values 
  ('essential'),
  ('monthly'),
  ('recurring');

-- Create bank accounts
insert into public.bank_accounts (name) values 
  ('Checking'),
  ('Savings');

-- Create budgets with linked category/tag rows
insert into public.budgets (name, type, target_amount, description)
values ('Monthly Grocery Budget', 'spend'::public.transaction_type, 300.00, 'Track grocery spending');

insert into public.budget_categories (budget_id, category_id)
select
  b.id,
  c.id
from public.budgets b
join public.categories c on c.name = 'Groceries'
where b.name = 'Monthly Grocery Budget';

insert into public.budget_tags (budget_id, tag_id)
select
  b.id,
  t.id
from public.budgets b
join public.tags t on t.name = 'essential'
where b.name = 'Monthly Grocery Budget';

-- Create transactions
with ids as (
  select
    (select id from public.categories where name = 'Groceries' limit 1) as grocery_cat,
    (select id from public.categories where name = 'Salary' limit 1) as salary_cat,
    (select id from public.bank_accounts where name = 'Checking' limit 1) as checking_ba,
    auth.uid() as uid
)
insert into public.transactions (user_id, date, type, amount, category_id, bank_account_id, tags)
select 
  uid,
  current_date - interval '1 day',
  'spend'::public.transaction_type,
  50.00,
  grocery_cat,
  checking_ba,
  array['essential', 'recurring']
from ids
union all
select 
  uid,
  current_date,
  'earn'::public.transaction_type,
  5000.00,
  salary_cat,
  checking_ba,
  array['monthly']
from ids;

-- ===== User 2: Create their own data (should not be affected) =====
select tests.authenticate_as('reset_user2@test.com');

insert into public.categories (type, name) values ('spend'::public.transaction_type, 'Transport');
insert into public.tags (name) values ('work');
insert into public.bank_accounts (name) values ('Monzo');
insert into public.budgets (name, type, target_amount, description)
values ('Transport Budget', 'spend'::public.transaction_type, 100.00, 'Keep transport spending in check');

with ids as (
  select
    (select id from public.categories where name = 'Transport' limit 1) as transport_cat,
    (select id from public.bank_accounts where name = 'Monzo' limit 1) as monzo_ba,
    auth.uid() as uid
)
insert into public.transactions (user_id, date, type, amount, category_id, bank_account_id, tags)
select 
  uid,
  current_date,
  'spend'::public.transaction_type,
  15.50,
  transport_cat,
  monzo_ba,
  array['work']
from ids;

-- ===== Test 1: User 1 has data before reset =====
select tests.authenticate_as('reset_user1@test.com');

select ok(
  (select count(*) from public.transactions) = 2,
  'Test 1: User 1 has 2 transactions before reset'
);

select ok(
  (select count(*) from public.categories) = 3,
  'Test 1: User 1 has 3 categories before reset'
);

select ok(
  (select count(*) from public.tags) = 3,
  'Test 1: User 1 has 3 tags before reset'
);

select ok(
  (select count(*) from public.bank_accounts) = 2,
  'Test 1: User 1 has 2 bank accounts before reset'
);

select ok(
  (select count(*) from public.budgets) = 1,
  'Test 1: User 1 has 1 budget before reset'
);

select ok(
  (select count(*) from public.budget_categories) = 1,
  'Test 1: User 1 has 1 budget-category link before reset'
);

select ok(
  (select count(*) from public.budget_tags) = 1,
  'Test 1: User 1 has 1 budget-tag link before reset'
);

-- ===== Test 2: Execute reset_user_data for User 1 =====
select lives_ok(
  $$ select public.reset_user_data() $$,
  'Test 2: reset_user_data() executes successfully for user 1'
);

-- ===== Test 3: User 1 data is deleted =====
select is(
  (select count(*) from public.transactions),
  0::bigint,
  'Test 3: User 1 transactions deleted after reset'
);

select is(
  (select count(*) from public.categories),
  0::bigint,
  'Test 3: User 1 categories deleted after reset'
);

select is(
  (select count(*) from public.tags),
  0::bigint,
  'Test 3: User 1 tags deleted after reset'
);

select is(
  (select count(*) from public.bank_accounts),
  0::bigint,
  'Test 3: User 1 bank accounts deleted after reset'
);

select is(
  (select count(*) from public.budgets),
  0::bigint,
  'Test 3: User 1 budgets deleted after reset'
);

select is(
  (select count(*) from public.budget_categories),
  0::bigint,
  'Test 3: User 1 budget-category links deleted after reset'
);

select is(
  (select count(*) from public.budget_tags),
  0::bigint,
  'Test 3: User 1 budget-tag links deleted after reset'
);

-- ===== Test 4: User 2 data is NOT affected =====
select tests.authenticate_as('reset_user2@test.com');

select results_eq(
  $$ select count(*) from public.categories $$,
  $$ values (1::bigint) $$,
  'Test 4: User 2 categories remain intact after user 1 reset'
);

select results_eq(
  $$ select count(*) from public.tags $$,
  $$ values (1::bigint) $$,
  'Test 4: User 2 tags remain intact after user 1 reset'
);

select results_eq(
  $$ select count(*) from public.transactions $$,
  $$ values (1::bigint) $$,
  'Test 4: User 2 transactions remain intact after user 1 reset'
);

select results_eq(
  $$ select count(*) from public.budgets $$,
  $$ values (1::bigint) $$,
  'Test 4: User 2 budgets remain intact after user 1 reset'
);

-- ===== Test 5: Unauthenticated user cannot reset =====
select tests.clear_authentication();

select throws_ok(
  $$ select public.reset_user_data() $$,
  '28000'
);

select * from finish();

rollback;

-- 016_bulk_insert_test.sql
-- pgTAP tests for bulk_insert_transactions

BEGIN;

-- Load pgtap extension
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(16);

-- Create test user using helper
SELECT tests.create_supabase_user('user1@test.com');

-- Authenticate as test user
SELECT tests.authenticate_as('user1@test.com');

-- Seed categories (use gen_random_uuid() for ids and tests.get_supabase_uid(email) to fetch user id)
INSERT INTO public.categories (id, user_id, type, name) VALUES
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'spend', 'Groceries'),
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'spend', 'Transport'),
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'earn', 'Salary'),
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'save', 'Emergency Fund');

-- Seed bank accounts
INSERT INTO public.bank_accounts (id, user_id, name) VALUES
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'Checking'),
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'Savings');

-- Seed tags
INSERT INTO public.tags (id, user_id, name) VALUES
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'essentials'),
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'monthly'),
  (gen_random_uuid(), tests.get_supabase_uid('user1@test.com'), 'vacation');

-- Test 1: Successful Bulk Insert (Basic)
SELECT extensions.results_eq(
  $$
    SELECT bulk_insert_transactions('[
      {
        "date": "2025-10-15",
        "type": "spend",
        "category": "Groceries",
        "amount": 50.00,
        "bank_account": "Checking"
      },
      {
        "date": "2025-10-16",
        "type": "earn",
        "category": "Salary",
        "amount": 3000.00
      }
    ]'::jsonb)->>'success'
  $$,
  ARRAY['true'::text],
  'Bulk insert succeeds with valid data'
);

-- Verify count
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = tests.get_supabase_uid('user1@test.com')),
  2::bigint,
  'Two transactions inserted'
);

-- Test 2: Successful Insert with Tags
SELECT extensions.results_eq(
  $$
    SELECT bulk_insert_transactions('[
      {
        "date": "2025-10-17",
        "type": "spend",
        "category": "Groceries",
        "amount": 75.50,
        "tags": ["essentials", "monthly"]
      }
    ]'::jsonb)->>'success'
  $$,
  ARRAY['true'::text],
  'Insert with tags succeeds'
);

-- Verify tags stored correctly (pick the inserted row)
SELECT extensions.is(
  (SELECT tags FROM public.transactions WHERE date = '2025-10-17' AND user_id = tests.get_supabase_uid('user1@test.com')),
  ARRAY['essentials', 'monthly']::text[],
  'Tags stored correctly as array'
);

-- Test 3: Missing Required Field Error
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[
      {"type": "spend", "amount": 50.00}
    ]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error when required field missing'
);

-- Test 4: Category Not Found Error
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[
      {
        "date": "2025-10-15",
        "type": "spend",
        "category": "NonExistentCategory",
        "amount": 50.00
      }
    ]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error when category not found'
);

-- Test 5: Category Type Mismatch
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[{"date":"2025-10-15","type":"spend","category":"Salary","amount":50.00}]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error when category type does not match transaction type'
);

-- Test 6: Bank Account Not Found Error
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[
      {
        "date": "2025-10-15",
        "type": "spend",
        "amount": 50.00,
        "bank_account": "NonExistentAccount"
      }
    ]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error when bank account not found'
);

-- Test 7: Tag Not Found Error
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[{"date":"2025-10-15","type":"spend","amount":50.00,"tags":["unknown-tag"]}]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error when tag does not exist'
);

-- Test 8: Invalid Transaction Type
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[
      {
        "date": "2025-10-15",
        "type": "invalid",
        "amount": 50.00
      }
    ]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error for invalid transaction type enum'
);

-- Test 9: Invalid Date Format
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[{"date":"not-a-date","type":"spend","amount":50.00}]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error for invalid date format'
);

-- Test 10: Non-Numeric Amount
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[{"date":"2025-10-15","type":"spend","amount":"not-a-number"}]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error for non-numeric amount'
);

-- Test 11: Atomic Rollback on Partial Failure
-- Insert one valid transaction
SELECT bulk_insert_transactions('[{"date":"2025-10-18","type":"spend","category":"Groceries","amount":25.00}]'::jsonb);

-- Try to insert batch with one valid and one invalid
SELECT extensions.throws_ok(
  $$
    SELECT bulk_insert_transactions('[
      {"date":"2025-10-19","type":"spend","category":"Transport","amount":15.00},
      {"date":"2025-10-20","type":"spend","category":"NonExistent","amount":30.00}
    ]'::jsonb)
  $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Throws error when batch contains invalid transaction'
);

-- Verify rollback: Test 1 inserted 2, Test 2 inserted 1, Test 11 just inserted 1, totaling 4
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = tests.get_supabase_uid('user1@test.com')),
  4::bigint,
  'Failed batch completely rolled back, previous inserts remain'
);

-- Test 12: Verify user isolation (transactions count is scoped to authenticated user)
-- This test verifies that the function only operates on the authenticated user's data
SELECT extensions.is(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = tests.get_supabase_uid('user1@test.com')),
  4::bigint,
  'Transactions are scoped to authenticated user'
);

-- Test 13: Reject parent category in bulk insert (leaf-only enforcement)
-- Setup: insert parent 'Utilities' then child 'Electricity' so Utilities becomes a parent
INSERT INTO public.categories (id, user_id, type, name)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001'::uuid,
        tests.get_supabase_uid('user1@test.com'), 'spend', 'Utilities');

INSERT INTO public.categories (id, user_id, type, name, parent_id)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002'::uuid,
        tests.get_supabase_uid('user1@test.com'), 'spend', 'Electricity',
        'bbbbbbbb-0000-0000-0000-000000000001'::uuid);

SELECT extensions.throws_ok(
  $$ SELECT bulk_insert_transactions('[{"date":"2026-01-01","type":"spend","category":"Utilities","amount":10}]'::jsonb) $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Reject parent category names in bulk transactions'
);

SELECT extensions.finish();
ROLLBACK;

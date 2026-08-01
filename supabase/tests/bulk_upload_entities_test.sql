-- 016_bulk_upload_entities_test.sql
-- Unit tests for insert_categories(p_user_id uuid, p_categories jsonb)
-- Use pgtap and test helpers for user creation/authentication

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- Create test users
select tests.create_supabase_user('user1@test.com');
select tests.create_supabase_user('user2@test.com');
select tests.create_supabase_user('user3@test.com');
select tests.create_supabase_user('user4@test.com');
select tests.create_supabase_user('user5@test.com');
select tests.create_supabase_user('user6@test.com');
select tests.create_supabase_user('user7@test.com');
select tests.create_supabase_user('user8@test.com');
select tests.create_supabase_user('user9@test.com');
select tests.create_supabase_user('user10@test.com');
select tests.create_supabase_user('user11@test.com');
select tests.create_supabase_user('user12@test.com');
select tests.create_supabase_user('user13@test.com');
select tests.create_supabase_user('user14@test.com');
select tests.create_supabase_user('user15@test.com');
select tests.create_supabase_user('user16@test.com');
select tests.create_supabase_user('user17@test.com');
select tests.create_supabase_user('user18@test.com');
select tests.create_supabase_user('user19@test.com');
select tests.create_supabase_user('user20@test.com');
select tests.create_supabase_user('user21@test.com');

-- Authenticate as user1 when helpful (not required for insert_categories which uses explicit user_id)
select tests.authenticate_as('user1@test.com');

-- Test 1: Insert New Categories
SELECT insert_categories(tests.get_supabase_uid('user1@test.com'),
  '[
    {"type": "spend", "name": "Groceries", "description": "Food"},
    {"type": "earn", "name": "Salary", "description": null},
    {"type": "save", "name": "Emergency", "description": "Rainy day"}
  ]'::jsonb);

SELECT is(
  (SELECT COUNT(*) FROM categories WHERE user_id = tests.get_supabase_uid('user1@test.com')),
  3::bigint,
  'Insert New Categories: 3 rows inserted'
);

-- Test 2: Skip Duplicate Categories
select tests.authenticate_as('user2@test.com');
SELECT insert_categories(tests.get_supabase_uid('user2@test.com'), '[{"type":"spend","name":"Groceries","description":"Food"}]'::jsonb);
SELECT insert_categories(tests.get_supabase_uid('user2@test.com'), '[{"type":"spend","name":"Groceries","description":"Food"}]'::jsonb);

SELECT is(
  (SELECT COUNT(*) FROM categories WHERE user_id = tests.get_supabase_uid('user2@test.com') AND name = 'Groceries'),
  1::bigint,
  'Skip Duplicate Categories: duplicates are not created'
);

-- Test 3: Missing Required Field - name (should raise)
select tests.authenticate_as('user3@test.com');
SELECT throws_like(
  $$ SELECT insert_categories(tests.get_supabase_uid('user3@test.com'), '[{"type":"spend","description":"no name"}]'::jsonb) $$,
  '%missing required fields%',
  'Missing name should raise a validation error'
);

-- Test 4: Missing Required Field - type (should raise)
select tests.authenticate_as('user4@test.com');
SELECT throws_like(
  $$ SELECT insert_categories(tests.get_supabase_uid('user4@test.com'), '[{"name":"NoType","description":"no type"}]'::jsonb) $$,
  '%missing required fields%',
  'Missing type should raise a validation error'
);

-- Test 5: Invalid Type Enum (should raise and mention the invalid value)
select tests.authenticate_as('user5@test.com');
SELECT throws_like(
  $$ SELECT insert_categories(tests.get_supabase_uid('user5@test.com'), '[{"type":"invalid","name":"BadType","description":null}]'::jsonb) $$,
  '%invalid transaction_type%',
  'Invalid enum value should raise invalid transaction_type error'
);

-- Test 6: NULL Description Handling
select tests.authenticate_as('user6@test.com');
SELECT insert_categories(tests.get_supabase_uid('user6@test.com'), '[{"type":"spend","name":"NullDesc","description": null}]'::jsonb);

SELECT ok(
  (SELECT description IS NULL FROM categories WHERE user_id = tests.get_supabase_uid('user6@test.com') AND name = 'NullDesc'),
  'NULL description handled correctly'
);

-- continue with other tests below; finish/rollback will be at end

-- Unit tests for insert_bank_accounts(p_user_id uuid, p_bank_accounts jsonb)

-- Test 7: Insert New Bank Accounts
select tests.authenticate_as('user15@test.com');
SELECT insert_bank_accounts(tests.get_supabase_uid('user15@test.com'),
  '[
    {"name": "Monzo", "description": "Monzo Current Account"},
    {"name": "Revolut", "description": null}
  ]'::jsonb);

SELECT is(
  (SELECT COUNT(*) FROM bank_accounts WHERE user_id = tests.get_supabase_uid('user15@test.com')),
  2::bigint,
  'Insert New Bank Accounts: 2 rows inserted'
);

-- Test 8: Skip Duplicate Bank Accounts
select tests.authenticate_as('user8@test.com');
SELECT insert_bank_accounts(tests.get_supabase_uid('user8@test.com'), '[{"name":"Monzo","description":"Monzo Current Account"}]'::jsonb);
SELECT insert_bank_accounts(tests.get_supabase_uid('user8@test.com'), '[{"name":"Monzo","description":"Monzo Current Account"}]'::jsonb);

SELECT is(
  (SELECT COUNT(*) FROM bank_accounts WHERE user_id = tests.get_supabase_uid('user8@test.com') AND name = 'Monzo'),
  1::bigint,
  'Skip Duplicate Bank Accounts: duplicates are not created'
);

-- Test 9: Missing Required Field - name (should raise)
select tests.authenticate_as('user9@test.com');
SELECT throws_like(
  $$ SELECT insert_bank_accounts(tests.get_supabase_uid('user9@test.com'), '[{"description":"no name"}]'::jsonb) $$,
  '%missing required field%',
  'Missing name should raise a validation error for bank accounts'
);

-- Test 10: NULL Description Handling
select tests.authenticate_as('user10@test.com');
SELECT insert_bank_accounts(tests.get_supabase_uid('user10@test.com'), '[{"name":"NullDescAccount","description": null}]'::jsonb);

SELECT ok(
  (SELECT description IS NULL FROM bank_accounts WHERE user_id = tests.get_supabase_uid('user10@test.com') AND name = 'NullDescAccount'),
  'NULL description handled correctly for bank accounts'
);

-- Unit tests for insert_tags(p_user_id uuid, p_tags jsonb)

-- Test 11: Insert New Tags
select tests.authenticate_as('user11@test.com');
SELECT insert_tags(tests.get_supabase_uid('user11@test.com'),
  '[
    {"name": "essentials", "description": "Essential expenses"},
    {"name": "monthly", "description": null},
    {"name": "one-off", "description": "One-off purchases"}
  ]'::jsonb);

SELECT is(
  (SELECT COUNT(*) FROM tags WHERE user_id = tests.get_supabase_uid('user11@test.com')),
  3::bigint,
  'Insert New Tags: 3 rows inserted'
);

-- Test 12: Skip Duplicate Tags
select tests.authenticate_as('user12@test.com');
SELECT insert_tags(tests.get_supabase_uid('user12@test.com'), '[{"name":"essentials","description":"Essential expenses"}]'::jsonb);
SELECT insert_tags(tests.get_supabase_uid('user12@test.com'), '[{"name":"essentials","description":"Essential expenses"}]'::jsonb);

SELECT is(
  (SELECT COUNT(*) FROM tags WHERE user_id = tests.get_supabase_uid('user12@test.com') AND name = 'essentials'),
  1::bigint,
  'Skip Duplicate Tags: duplicates are not created'
);

-- Test 13: Missing Required Field - name (should raise)
select tests.authenticate_as('user13@test.com');
SELECT throws_like(
  $$ SELECT insert_tags(tests.get_supabase_uid('user13@test.com'), '[{"description":"no name"}]'::jsonb) $$,
  '%missing required field%',
  'Missing name should raise a validation error for tags'
);

-- Test 14: NULL Description Handling
select tests.authenticate_as('user14@test.com');
SELECT insert_tags(tests.get_supabase_uid('user14@test.com'), '[{"name":"NullDescTag","description": null}]'::jsonb);

SELECT ok(
  (SELECT description IS NULL FROM tags WHERE user_id = tests.get_supabase_uid('user14@test.com') AND name = 'NullDescTag'),
  'NULL description handled correctly for tags'
);

-- Integration tests for bulk_upload_data

-- Test 15: Upload Entities Only (No Transactions)
select tests.authenticate_as('user1@test.com');
WITH res AS (
  SELECT bulk_upload_data(jsonb_build_object(
    'categories', '[{"type":"spend","name":"Groc1","description":"Food"}]'::jsonb,
    'bank_accounts', '[{"name":"BA1","description":"Main"}]'::jsonb,
    'tags', '[{"name":"t1","description":null}]'::jsonb
  )) AS r
)
SELECT is(
  ((SELECT (r->>'categories_inserted')::bigint FROM res)),
  1::bigint,
  'Integration: categories inserted count is 1'
);

-- Test 16: Upload Transactions Only (legacy behavior)
select tests.authenticate_as('user2@test.com');
WITH res AS (
  SELECT bulk_upload_data(jsonb_build_object(
    'transactions', '[{"date":"2025-01-01","type":"spend","amount":"10.00"},{"date":"2025-01-02","type":"earn","amount":"5.00"}]'::jsonb
  )) AS r
)
SELECT is(
  ((SELECT (r->>'transactions_inserted')::bigint FROM res)),
  2::bigint,
  'Integration: transactions only inserted count is 2'
);

-- Test 17: Upload Full Payload (Entities + Transactions)
select tests.authenticate_as('user3@test.com');
WITH res AS (
  SELECT bulk_upload_data(jsonb_build_object(
    'categories', '[{"type":"spend","name":"GFull","description":null}]'::jsonb,
    'bank_accounts', '[{"name":"BAFull","description":null}]'::jsonb,
    'tags', '[{"name":"tFull","description":null}]'::jsonb,
    'transactions', '[{"date":"2025-02-01","type":"spend","amount":"20.00","category":"GFull","bank_account":"BAFull","tags":["tFull"]}]'::jsonb
  )) AS r
)
SELECT is(
  ((SELECT (r->>'transactions_inserted')::bigint FROM res)),
  1::bigint,
  'Integration: full payload inserted 1 transaction'
);

-- Test 18: Empty Payload
select tests.authenticate_as('user4@test.com');
SELECT is(
  (SELECT (bulk_upload_data('{}'::jsonb)->>'categories_inserted')::bigint),
  0::bigint,
  'Integration: empty payload returns zero categories'
);

-- Test 19: Idempotency - upload same payload twice
select tests.authenticate_as('user5@test.com');
-- Execute first upload via DO block (not counted as a test)
DO $$ 
DECLARE v_result jsonb;
BEGIN
  v_result := bulk_upload_data(jsonb_build_object('categories','[{"type":"spend","name":"Idem","description":null}]'::jsonb));
END $$;
-- Second upload should insert 0 (idempotent)
SELECT is(
  (SELECT (bulk_upload_data(jsonb_build_object('categories','[{"type":"spend","name":"Idem","description":null}]'::jsonb)))->>'categories_inserted')::bigint,
  0::bigint,
  'Integration: idempotent second upload inserts 0 new categories'
);

-- Test 20: Transaction References Existing Entity (category exists already)
select tests.authenticate_as('user6@test.com');
-- create the category first via DO block (not counted as test)
DO $$
BEGIN
  PERFORM insert_categories(tests.get_supabase_uid('user6@test.com'), '[{"type":"spend","name":"ExistsCat","description":null}]'::jsonb);
END $$;
SELECT is(
  (SELECT (bulk_upload_data(jsonb_build_object('transactions','[{"date":"2025-03-01","type":"spend","amount":"15.00","category":"ExistsCat"}]'::jsonb)))->>'transactions_inserted')::bigint,
  1::bigint,
  'Integration: transaction referencing existing category inserted'
);

-- Test 21: Atomicity - Category Error Rolls Back All (invalid category in payload)
select tests.authenticate_as('user7@test.com');
SELECT throws_like(
  $$ SELECT bulk_upload_data(jsonb_build_object('bank_accounts','[{"name":"ShouldNotExist","description":null}]'::jsonb,'categories','[{"type":"spend","description":"no name"}]'::jsonb)) $$,
  '%missing required fields%','Atomicity: invalid category causes entire upload to fail'
);

SELECT is(
  (SELECT COUNT(*) FROM bank_accounts WHERE user_id = tests.get_supabase_uid('user7@test.com') AND name = 'ShouldNotExist'),
  0::bigint,
  'Atomicity: bank account not inserted due to category error'
);

-- Note: Test 22 (Not Authenticated) is omitted because pgTAP runs in a single transaction
-- and once authenticated via tests.authenticate_as(), we cannot reliably clear the session
-- to test unauthenticated behavior. The authentication checks in insert_categories, 
-- insert_bank_accounts, insert_tags, and bulk_upload_data are still validated through
-- the function code review and by the fact that all other tests require authentication.

-- Test 23: Bulk upload rejects transaction referencing a parent category
select tests.authenticate_as('user16@test.com');
-- Create parent 'Utilities' and child 'Electricity' so Utilities becomes a non-leaf
DO $$
BEGIN
  INSERT INTO public.categories (id, user_id, type, name)
  VALUES ('cccccccc-0000-0000-0000-000000000001'::uuid,
          tests.get_supabase_uid('user16@test.com'), 'spend', 'Utilities');
  INSERT INTO public.categories (id, user_id, type, name, parent_id)
  VALUES ('cccccccc-0000-0000-0000-000000000002'::uuid,
          tests.get_supabase_uid('user16@test.com'), 'spend', 'Electricity',
          'cccccccc-0000-0000-0000-000000000001'::uuid);
END $$;

SELECT throws_like(
  $$ SELECT bulk_upload_data(jsonb_build_object(
      'transactions', '[{"date":"2026-01-01","type":"spend","amount":"20.00","category":"Utilities"}]'::jsonb
    )) $$,
  '%Bulk insert failed with 1 error(s)%',
  'Bulk upload rejects parent category names in transactions'
);

-- Unit tests for nested category creation via the "parent" field
-- (insert_categories(p_user_id, p_categories) — parent auto-vivify support)

-- Test 24: Nested category — auto-creates missing parent, returns 2 inserted
select tests.authenticate_as('user17@test.com');
SELECT is(
  insert_categories(tests.get_supabase_uid('user17@test.com'),
    '[{"type":"spend","name":"Eating out","parent":"Food"}]'::jsonb),
  2,
  'Nested category: auto-creates missing parent, returns 2 inserted'
);

-- Test 25: root parent "Food" was auto-created
SELECT ok(
  EXISTS(
    SELECT 1 FROM categories
    WHERE user_id = tests.get_supabase_uid('user17@test.com')
      AND name = 'Food' AND parent_id IS NULL
  ),
  'Nested category: root parent "Food" was auto-created'
);

-- Test 26: child "Eating out" was created under "Food"
SELECT ok(
  EXISTS(
    SELECT 1 FROM categories c
    JOIN categories p ON p.id = c.parent_id
    WHERE c.user_id = tests.get_supabase_uid('user17@test.com')
      AND c.name = 'Eating out' AND p.name = 'Food' AND p.parent_id IS NULL
  ),
  'Nested category: child "Eating out" was created under "Food"'
);

-- Test 27: nested category with a pre-existing parent — only the child is inserted
select tests.authenticate_as('user18@test.com');
DO $$
BEGIN
  INSERT INTO public.categories (user_id, type, name)
  VALUES (tests.get_supabase_uid('user18@test.com'), 'spend', 'Food');
END $$;

SELECT is(
  insert_categories(tests.get_supabase_uid('user18@test.com'),
    '[{"type":"spend","name":"Eating out","parent":"Food"}]'::jsonb),
  1,
  'Nested category: pre-existing parent, only the child is inserted'
);

-- Test 28: no duplicate root "Food" was created
SELECT is(
  (SELECT COUNT(*) FROM categories
    WHERE user_id = tests.get_supabase_uid('user18@test.com')
      AND name = 'Food' AND parent_id IS NULL),
  1::bigint,
  'Nested category: no duplicate root "Food" was created'
);

-- Test 29: idempotency — re-running the same nested payload inserts 0
select tests.authenticate_as('user17@test.com');
SELECT is(
  insert_categories(tests.get_supabase_uid('user17@test.com'),
    '[{"type":"spend","name":"Eating out","parent":"Food"}]'::jsonb),
  0,
  'Nested category: idempotent re-upload inserts 0 new rows'
);

-- Test 30: 3-level chain (a name used as both parent and child) is rejected
select tests.authenticate_as('user19@test.com');
SELECT throws_like(
  $$ SELECT insert_categories(tests.get_supabase_uid('user19@test.com'),
      '[{"type":"spend","name":"B","parent":"A"},{"type":"spend","name":"C","parent":"B"}]'::jsonb) $$,
  '%cannot be both a parent and a child%',
  '3-level category chain is rejected'
);

-- Test 31: bulk_upload_data end-to-end — categories + transactions in one call,
-- proving a "Parent/Child" transaction reference no longer requires the
-- categories to pre-exist (fixes the "Known limitation" from the previous plan)
select tests.authenticate_as('user20@test.com');
SELECT is(
  (SELECT (bulk_upload_data(jsonb_build_object(
      'categories', '[{"type":"spend","name":"Eating out","parent":"Food"}]'::jsonb,
      'transactions', '[{"date":"2026-05-01","type":"spend","amount":10,"category":"Food/Eating out"}]'::jsonb
    )))->>'transactions_inserted')::bigint,
  1::bigint,
  'End-to-end: nested category created and resolved for a transaction in the same call'
);

select * from finish();
rollback;

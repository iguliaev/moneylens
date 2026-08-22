-- Unit/integration tests for insert_budgets(p_user_id uuid, p_budgets jsonb)
-- and its wiring into bulk_upload_data. Mirrors the conventions of
-- bulk_upload_entities_test.sql (categories/bank_accounts/tags).

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select tests.create_supabase_user('budget_user1@test.com');
select tests.create_supabase_user('budget_user2@test.com');
select tests.create_supabase_user('budget_user3@test.com');
select tests.create_supabase_user('budget_user4@test.com');
select tests.create_supabase_user('budget_user5@test.com');
select tests.create_supabase_user('budget_user6@test.com');
select tests.create_supabase_user('budget_user7@test.com');
select tests.create_supabase_user('budget_user8@test.com');
select tests.create_supabase_user('budget_user9@test.com');
select tests.create_supabase_user('budget_user10@test.com');
select tests.create_supabase_user('budget_user11@test.com');
select tests.create_supabase_user('budget_user12@test.com');
select tests.create_supabase_user('budget_user13@test.com');
select tests.create_supabase_user('budget_user14@test.com');
select tests.create_supabase_user('budget_user15@test.com');

-- Test 1: Insert a new budget with no categories/tags
select tests.authenticate_as('budget_user1@test.com');
SELECT is(
  insert_budgets(tests.get_supabase_uid('budget_user1@test.com'),
    '[{"name":"Groceries budget","type":"spend","target_amount":400}]'::jsonb),
  1,
  'Insert new budget: 1 row inserted'
);

-- Test 2: Skip duplicate budget (same name, among non-deleted)
select tests.authenticate_as('budget_user2@test.com');
SELECT insert_budgets(tests.get_supabase_uid('budget_user2@test.com'),
  '[{"name":"Rent","type":"spend","target_amount":1000}]'::jsonb);
SELECT is(
  insert_budgets(tests.get_supabase_uid('budget_user2@test.com'),
    '[{"name":"Rent","type":"spend","target_amount":1000}]'::jsonb),
  0,
  'Skip duplicate budget: second insert returns 0'
);

-- Test 3: Missing required field - name
select tests.authenticate_as('budget_user3@test.com');
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"type":"spend","target_amount":100}]'::jsonb) $$,
  '%missing required fields%',
  'Missing name should raise a validation error'
);

-- Test 4: Missing required field - type
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"NoType","target_amount":100}]'::jsonb) $$,
  '%missing required fields%',
  'Missing type should raise a validation error'
);

-- Test 5: Missing required field - target_amount
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"NoAmount","type":"spend"}]'::jsonb) $$,
  '%missing required fields%',
  'Missing target_amount should raise a validation error'
);

-- Test 6: Invalid type enum
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"BadType","type":"invalid","target_amount":100}]'::jsonb) $$,
  '%invalid transaction_type%',
  'Invalid enum value should raise invalid transaction_type error'
);

-- Test 7: target_amount <= 0 is pre-validated and raises a friendly,
-- budget-naming P0001 error rather than the sanitized CHECK-constraint one.
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"ZeroAmount","type":"spend","target_amount":0}]'::jsonb) $$,
  '%target_amount for budget "ZeroAmount" must be greater than 0%',
  'Non-positive target_amount raises a friendly, budget-naming error'
);

-- Test 7b: non-numeric target_amount raises a friendly error
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"NaNAmount","type":"spend","target_amount":"abc"}]'::jsonb) $$,
  '%target_amount for budget "NaNAmount" is not a valid number%',
  'Non-numeric target_amount raises a friendly error'
);

-- Test 7c: malformed start_date raises a friendly error
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"BadDate","type":"spend","target_amount":10,"start_date":"not-a-date"}]'::jsonb) $$,
  '%start_date for budget "BadDate" is not a valid date%',
  'Malformed start_date raises a friendly error'
);

-- Test 7d: start_date after end_date raises a friendly error
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user3@test.com'), '[{"name":"BackwardsRange","type":"spend","target_amount":10,"start_date":"2026-06-01","end_date":"2026-01-01"}]'::jsonb) $$,
  '%start_date must be on or before end_date for budget "BackwardsRange"%',
  'start_date after end_date raises a friendly error'
);

-- Test 8: Budget with a bare root-leaf category name links it
select tests.authenticate_as('budget_user4@test.com');
DO $$
BEGIN
  INSERT INTO public.categories (user_id, type, name)
  VALUES (tests.get_supabase_uid('budget_user4@test.com'), 'spend', 'Fun');
END $$;

SELECT is(
  insert_budgets(tests.get_supabase_uid('budget_user4@test.com'),
    '[{"name":"Fun budget","type":"spend","target_amount":50,"categories":["Fun"]}]'::jsonb),
  1,
  'Budget with bare category name: 1 budget inserted'
);

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.budget_categories bc
    JOIN public.budgets b ON b.id = bc.budget_id
    JOIN public.categories c ON c.id = bc.category_id
    WHERE b.user_id = tests.get_supabase_uid('budget_user4@test.com')
      AND b.name = 'Fun budget' AND c.name = 'Fun'
  ),
  'Budget linked to the bare-name category'
);

-- Test 9: Budget with a "Parent/Child" category path links the nested category
select tests.authenticate_as('budget_user5@test.com');
DO $$
DECLARE v_parent uuid;
BEGIN
  INSERT INTO public.categories (user_id, type, name)
  VALUES (tests.get_supabase_uid('budget_user5@test.com'), 'spend', 'Food')
  RETURNING id INTO v_parent;
  INSERT INTO public.categories (user_id, type, name, parent_id)
  VALUES (tests.get_supabase_uid('budget_user5@test.com'), 'spend', 'Eating out', v_parent);
END $$;

SELECT insert_budgets(tests.get_supabase_uid('budget_user5@test.com'),
  '[{"name":"Food budget","type":"spend","target_amount":200,"categories":["Food/Eating out"]}]'::jsonb);

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.budget_categories bc
    JOIN public.budgets b ON b.id = bc.budget_id
    JOIN public.categories c ON c.id = bc.category_id
    WHERE b.user_id = tests.get_supabase_uid('budget_user5@test.com')
      AND b.name = 'Food budget' AND c.name = 'Eating out'
  ),
  'Budget linked to the nested "Parent/Child" category'
);

-- Test 9b: A bare category name matching a root category that HAS children
-- (a parent, not a leaf) still resolves — budgets, unlike transactions, can
-- legitimately target a parent category, since the budgets UI's picker
-- offers every category of the type, not just leaves.
select tests.authenticate_as('budget_user15@test.com');
DO $$
DECLARE v_parent uuid;
BEGIN
  INSERT INTO public.categories (user_id, type, name)
  VALUES (tests.get_supabase_uid('budget_user15@test.com'), 'spend', 'Food')
  RETURNING id INTO v_parent;
  INSERT INTO public.categories (user_id, type, name, parent_id)
  VALUES (tests.get_supabase_uid('budget_user15@test.com'), 'spend', 'Eating out', v_parent);
END $$;

SELECT is(
  insert_budgets(tests.get_supabase_uid('budget_user15@test.com'),
    '[{"name":"Food budget (parent)","type":"spend","target_amount":300,"categories":["Food"]}]'::jsonb),
  1,
  'Budget with bare name matching a non-leaf (parent) category: 1 budget inserted'
);

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.budget_categories bc
    JOIN public.budgets b ON b.id = bc.budget_id
    JOIN public.categories c ON c.id = bc.category_id
    WHERE b.user_id = tests.get_supabase_uid('budget_user15@test.com')
      AND b.name = 'Food budget (parent)' AND c.name = 'Food' AND c.parent_id IS NULL
  ),
  'Budget linked to the bare-name parent category, not its child'
);

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.budget_categories bc
    JOIN public.budgets b ON b.id = bc.budget_id
    JOIN public.categories c ON c.id = bc.category_id
    WHERE b.user_id = tests.get_supabase_uid('budget_user15@test.com')
      AND b.name = 'Food budget (parent)' AND c.name = 'Eating out'
  ),
  'Budget is not accidentally linked to the child category'
);

-- Test 10: Bare category name not found raises a whole-batch error
select tests.authenticate_as('budget_user6@test.com');
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user6@test.com'),
      '[{"name":"Bad budget","type":"spend","target_amount":50,"categories":["Nope"]}]'::jsonb) $$,
  '%not found as a root-level category%',
  'Unresolved bare category name raises an error'
);

-- Test 11: no partial budget row left behind after the category error
SELECT is(
  (SELECT COUNT(*) FROM public.budgets WHERE user_id = tests.get_supabase_uid('budget_user6@test.com') AND name = 'Bad budget'),
  0::bigint,
  'Atomicity: budget row not left behind after category resolution error'
);

-- Test 12: "Parent/Child" path, parent not found
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user6@test.com'),
      '[{"name":"Bad budget 2","type":"spend","target_amount":50,"categories":["Ghost/Child"]}]'::jsonb) $$,
  '%category parent%not found%',
  'Unresolved category parent raises an error'
);

-- Test 13: "Parent/Child" path, parent found but child not found under it
select tests.authenticate_as('budget_user7@test.com');
DO $$
BEGIN
  INSERT INTO public.categories (user_id, type, name)
  VALUES (tests.get_supabase_uid('budget_user7@test.com'), 'spend', 'RealParent');
END $$;
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user7@test.com'),
      '[{"name":"Bad budget 3","type":"spend","target_amount":50,"categories":["RealParent/Missing"]}]'::jsonb) $$,
  '%RealParent/Missing%not found%',
  'Parent found but child missing under it raises an error'
);

-- Test 14: Budget with a valid tag links it
select tests.authenticate_as('budget_user8@test.com');
DO $$
BEGIN
  INSERT INTO public.tags (user_id, name)
  VALUES (tests.get_supabase_uid('budget_user8@test.com'), 'essentials');
END $$;

SELECT insert_budgets(tests.get_supabase_uid('budget_user8@test.com'),
  '[{"name":"Tagged budget","type":"spend","target_amount":50,"tags":["essentials"]}]'::jsonb);

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.budget_tags bt
    JOIN public.budgets b ON b.id = bt.budget_id
    JOIN public.tags t ON t.id = bt.tag_id
    WHERE b.user_id = tests.get_supabase_uid('budget_user8@test.com')
      AND b.name = 'Tagged budget' AND t.name = 'essentials'
  ),
  'Budget linked to the referenced tag'
);

-- Test 15: Unresolved tag name raises an error
select tests.authenticate_as('budget_user9@test.com');
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user9@test.com'),
      '[{"name":"Bad tag budget","type":"spend","target_amount":50,"tags":["ghost-tag"]}]'::jsonb) $$,
  '%tag "ghost-tag" not found%',
  'Unresolved tag name raises an error'
);

-- Test 16: A soft-deleted category is never reused for a bare-name reference
select tests.authenticate_as('budget_user10@test.com');
DO $$
BEGIN
  INSERT INTO public.categories (user_id, type, name, deleted_at)
  VALUES (tests.get_supabase_uid('budget_user10@test.com'), 'spend', 'Gone', now());
END $$;
SELECT throws_like(
  $$ SELECT insert_budgets(tests.get_supabase_uid('budget_user10@test.com'),
      '[{"name":"Ghost budget","type":"spend","target_amount":50,"categories":["Gone"]}]'::jsonb) $$,
  '%not found as a root-level category%',
  'Soft-deleted category is not reused for budget linking'
);

-- Integration tests via bulk_upload_data

-- Test 17: bulk_upload_data reports budgets_inserted
select tests.authenticate_as('budget_user11@test.com');
SELECT is(
  (SELECT (bulk_upload_data(jsonb_build_object(
      'budgets', '[{"name":"BUD Budget","type":"spend","target_amount":75}]'::jsonb
    )))->>'budgets_inserted')::bigint,
  1::bigint,
  'Integration: bulk_upload_data reports budgets_inserted'
);

-- Test 18: budgets can reference categories/tags created in the same payload
select tests.authenticate_as('budget_user12@test.com');
SELECT is(
  (SELECT (bulk_upload_data(jsonb_build_object(
      'categories', '[{"type":"spend","name":"Travel"}]'::jsonb,
      'tags', '[{"name":"vacation"}]'::jsonb,
      'budgets', '[{"name":"Travel budget","type":"spend","target_amount":500,"categories":["Travel"],"tags":["vacation"]}]'::jsonb
    )))->>'budgets_inserted')::bigint,
  1::bigint,
  'Integration: budget resolves categories/tags created earlier in the same payload'
);

SELECT ok(
  EXISTS(
    SELECT 1 FROM public.budget_categories bc
    JOIN public.budgets b ON b.id = bc.budget_id
    JOIN public.categories c ON c.id = bc.category_id
    WHERE b.user_id = tests.get_supabase_uid('budget_user12@test.com')
      AND b.name = 'Travel budget' AND c.name = 'Travel'
  ),
  'Integration: same-payload category is linked to the budget'
);

-- Test 19: Idempotency - re-uploading the same budgets payload inserts 0
select tests.authenticate_as('budget_user13@test.com');
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := bulk_upload_data(jsonb_build_object('budgets', '[{"name":"Idem Budget","type":"spend","target_amount":10}]'::jsonb));
END $$;
SELECT is(
  (SELECT (bulk_upload_data(jsonb_build_object('budgets', '[{"name":"Idem Budget","type":"spend","target_amount":10}]'::jsonb)))->>'budgets_inserted')::bigint,
  0::bigint,
  'Integration: idempotent second upload inserts 0 new budgets'
);

-- Test 20: Atomicity - an unresolved budget category rolls back the whole call
select tests.authenticate_as('budget_user14@test.com');
SELECT throws_like(
  $$ SELECT bulk_upload_data(jsonb_build_object(
      'bank_accounts', '[{"name":"ShouldNotExist"}]'::jsonb,
      'budgets', '[{"name":"Bad","type":"spend","target_amount":10,"categories":["Nope"]}]'::jsonb
    )) $$,
  '%not found as a root-level category%',
  'Atomicity: unresolved budget category causes entire upload to fail'
);

-- Test 21
SELECT is(
  (SELECT COUNT(*) FROM public.bank_accounts WHERE user_id = tests.get_supabase_uid('budget_user14@test.com') AND name = 'ShouldNotExist'),
  0::bigint,
  'Atomicity: bank account not inserted due to budget category error'
);

select * from finish();
rollback;

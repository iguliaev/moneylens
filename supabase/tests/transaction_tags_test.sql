begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- Create two test users
select tests.create_supabase_user('tx_user1@test.com');
select tests.create_supabase_user('tx_user2@test.com');

-- As User 1
select tests.authenticate_as('tx_user1@test.com');

-- Prepare supporting data: category and bank_account
INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'TestCat')
ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

INSERT INTO public.bank_accounts (user_id, name)
VALUES (auth.uid(), 'TestAccount')
ON CONFLICT (user_id, name) DO NOTHING;

-- Create a tag for user1
INSERT INTO public.tags (user_id, name)
VALUES (auth.uid(), 'TestTag')
ON CONFLICT (user_id, name) DO NOTHING;

-- Create a transaction for user1
INSERT INTO public.transactions (user_id, date, type, amount, category_id, bank_account_id)
VALUES (
  auth.uid(),
  '2025-01-01',
  'spend'::public.transaction_type,
  100,
  (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'TestCat' LIMIT 1),
  (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'TestAccount' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- 1) Table exists
SELECT has_table('transaction_tags', 'transaction_tags table should exist');

-- 2) Required columns exist
SELECT has_column('transaction_tags', 'id', 'Should have id column');
SELECT has_column('transaction_tags', 'transaction_id', 'Should have transaction_id column');
SELECT has_column('transaction_tags', 'tag_id', 'Should have tag_id column');
SELECT has_column('transaction_tags', 'created_at', 'Should have created_at column');

-- 3) RLS is enabled
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'transaction_tags'),
  'RLS should be enabled on transaction_tags'
);

-- 4) User1 can insert their own transaction tag association
SELECT lives_ok(
  $$
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    VALUES (
      (SELECT id FROM public.transactions WHERE user_id = auth.uid() LIMIT 1),
      (SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'TestTag' LIMIT 1)
    )
  $$,
  'User1 can insert own transaction_tags'
);

-- 5) Selecting transaction_tags returns the association for User1
SELECT results_eq(
  $$ SELECT COUNT(*) FROM public.transaction_tags WHERE transaction_id = (SELECT id FROM public.transactions WHERE user_id = auth.uid() LIMIT 1) $$,
  array[1::bigint],
  'User1 sees their transaction_tags'
);

-- 6) User1 can delete their own transaction_tag
SELECT lives_ok(
  $$ DELETE FROM public.transaction_tags WHERE transaction_id = (SELECT id FROM public.transactions WHERE user_id = auth.uid() LIMIT 1) $$,
  'User1 can delete their own transaction_tag'
);

SELECT is_empty(
  $$ SELECT 1 FROM public.transaction_tags WHERE transaction_id = (SELECT id FROM public.transactions WHERE user_id = auth.uid() LIMIT 1) $$,
  'No transaction_tags remain for user1 transaction'
);

-- Re-insert association for cascade tests
INSERT INTO public.transaction_tags (transaction_id, tag_id)
VALUES (
  (SELECT id FROM public.transactions WHERE user_id = auth.uid() LIMIT 1),
  (SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'TestTag' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- 7) Cascade delete on transaction removes association
SELECT lives_ok(
  $$ DELETE FROM public.transactions WHERE user_id = auth.uid() AND date = '2025-01-01' $$,
  'Deleting transaction cascades to transaction_tags'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags WHERE transaction_id = (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND date = '2025-01-01')) = 0,
  'transaction_tags cleared after transaction delete'
);

-- Recreate transaction and association for tag cascade test
INSERT INTO public.transactions (user_id, date, type, amount, category_id, bank_account_id)
VALUES (
  auth.uid(), '2025-01-02', 'spend'::public.transaction_type, 200,
  (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'TestCat' LIMIT 1),
  (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'TestAccount' LIMIT 1)
)
ON CONFLICT DO NOTHING;

INSERT INTO public.transaction_tags (transaction_id, tag_id)
VALUES (
  (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND date = '2025-01-02' LIMIT 1),
  (SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'TestTag' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- 8) Cascade delete on tag removes association
SELECT lives_ok(
  $$ DELETE FROM public.tags WHERE user_id = auth.uid() AND name = 'TestTag' $$,
  'Deleting tag cascades to transaction_tags'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags WHERE tag_id = (SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'TestTag')) = 0,
  'transaction_tags cleared after tag delete'
);

-- 9) Unique constraint prevents duplicate associations
-- Recreate tag and transaction
INSERT INTO public.tags (user_id, name) VALUES (auth.uid(), 'UcTag') ON CONFLICT DO NOTHING;
INSERT INTO public.transactions (user_id, date, type, amount, category_id, bank_account_id)
VALUES (
  auth.uid(), '2025-01-03', 'spend'::public.transaction_type, 50,
  (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'TestCat' LIMIT 1),
  (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'TestAccount' LIMIT 1)
) ON CONFLICT DO NOTHING;

INSERT INTO public.transaction_tags (transaction_id, tag_id)
VALUES (
  (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND date = '2025-01-03' LIMIT 1),
  (SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'UcTag' LIMIT 1)
) ON CONFLICT DO NOTHING;

SELECT throws_like(
  $$ INSERT INTO public.transaction_tags (transaction_id, tag_id)
     VALUES (
       (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND date = '2025-01-03' LIMIT 1),
       (SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'UcTag' LIMIT 1)
     ) $$,
  '%uq_transaction_tag%',
  'Duplicate association violates unique constraint uq_transaction_tag'
);

-- 10) Access control: User2 cannot see or modify User1's associations
select tests.authenticate_as('tx_user2@test.com');

SELECT results_eq(
  $$ SELECT COUNT(*) FROM public.transaction_tags $$,
  array[0::bigint],
  'User2 sees no transaction_tags from User1'
);

SELECT is_empty(
  $$ UPDATE public.transaction_tags SET created_at = now() WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = tests.get_supabase_uid('tx_user1@test.com')) RETURNING 1 $$,
  'User2 cannot update User1 transaction_tags'
);

-- 11) IDOR: User2 cannot read User1's transaction tags via get_transaction_tags RPC
SELECT results_eq(
  $$ SELECT public.get_transaction_tags(
      (SELECT id FROM public.transactions WHERE user_id = tests.get_supabase_uid('tx_user1@test.com') AND date = '2025-01-03' LIMIT 1)
    ) $$,
  $$ SELECT '[]'::jsonb $$,
  'User2 cannot read User1 transaction tags via get_transaction_tags'
);

-- Finish
select * from finish();
ROLLBACK;

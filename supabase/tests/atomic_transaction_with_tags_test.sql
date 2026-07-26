-- supabase/tests/atomic_transaction_with_tags_test.sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

-- Setup two test users
select tests.create_supabase_user('atomic_user1@test.com');
select tests.create_supabase_user('atomic_user2@test.com');

-- Seed reference data for user2 (for cross-user security tests)
select tests.authenticate_as('atomic_user2@test.com');

INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'User2Cat')
ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

INSERT INTO public.bank_accounts (user_id, name)
VALUES (auth.uid(), 'User2Account')
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.tags (user_id, name)
VALUES (auth.uid(), 'User2Tag')
ON CONFLICT (user_id, name) DO NOTHING;

-- Capture user2's ids while authenticated as their owner. Fetching these by
-- name *after* switching to user1 would go through RLS and silently return
-- NULL (user1 can't see user2's rows), which would make the "other user's
-- category/account/tag" tests below pass vacuously against a NULL id
-- instead of actually exercising the ownership check.
select set_config(
  'test.user2_cat_id',
  (SELECT id::text FROM public.categories WHERE user_id = auth.uid() AND name = 'User2Cat'),
  false
);
select set_config(
  'test.user2_account_id',
  (SELECT id::text FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'User2Account'),
  false
);
select set_config(
  'test.user2_tag_id',
  (SELECT id::text FROM public.tags WHERE user_id = auth.uid() AND name = 'User2Tag'),
  false
);

select tests.authenticate_as('atomic_user1@test.com');

-- Seed reference data for user1
INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'AtomicCat')
ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

INSERT INTO public.bank_accounts (user_id, name)
VALUES (auth.uid(), 'AtomicAccount')
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.tags (user_id, name)
VALUES (auth.uid(), 'AtomicTag1'), (auth.uid(), 'AtomicTag2')
ON CONFLICT (user_id, name) DO NOTHING;

-- 1) create_transaction_with_tags function exists
SELECT has_function(
  'public', 'create_transaction_with_tags',
  ARRAY['jsonb', 'uuid[]'],
  'create_transaction_with_tags function should exist'
);

-- 2) create_transaction_with_tags returns a transaction row (no tags)
SELECT ok(
  (SELECT (public.create_transaction_with_tags(
    jsonb_build_object(
      'date', '2026-01-01',
      'type', 'spend',
      'amount', 100,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'no-tags-test'
    ),
    ARRAY[]::uuid[]
  )).id IS NOT NULL),
  'create_transaction_with_tags returns row with id'
);

-- 3) Transaction is persisted in DB
SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'no-tags-test') = 1,
  'Transaction persisted in DB after create_transaction_with_tags'
);

-- 4) create with tags: both transaction and tag association are created
SELECT ok(
  (SELECT (public.create_transaction_with_tags(
    jsonb_build_object(
      'date', '2026-01-02',
      'type', 'spend',
      'amount', 200,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'with-tags-test'
    ),
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'AtomicTag1')]
  )).id IS NOT NULL),
  'create with tags: returns transaction id'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   WHERE t.user_id = auth.uid() AND t.notes = 'with-tags-test') = 1,
  'Tag association created atomically with transaction'
);

-- 5) Atomicity: tag ownership check raises 42501 — no orphan transaction
SELECT throws_ok(
  $$
    SELECT public.create_transaction_with_tags(
      jsonb_build_object(
        'date', '2026-01-03',
        'type', 'spend',
        'amount', 300,
        'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
        'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
        'notes', 'orphan-should-not-exist'
      ),
      ARRAY['00000000-0000-0000-0000-000000000000'::uuid]
    )
  $$,
  '42501'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'orphan-should-not-exist') = 0,
  'No orphan transaction left after tag ownership check'
);

-- 6) update_transaction_with_tags function exists
SELECT has_function(
  'public', 'update_transaction_with_tags',
  ARRAY['uuid', 'jsonb', 'uuid[]'],
  'update_transaction_with_tags function should exist'
);

-- Setup: create a transaction to be updated
DO $$
BEGIN
  PERFORM public.create_transaction_with_tags(
    jsonb_build_object(
      'date', '2026-01-10',
      'type', 'spend',
      'amount', 500,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'to-be-updated'
    ),
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'AtomicTag1')]
  );
END;
$$;

-- 7) update returns updated transaction
SELECT ok(
  (SELECT (public.update_transaction_with_tags(
    (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'to-be-updated'),
    jsonb_build_object(
      'date', '2026-01-10',
      'type', 'spend',
      'amount', 999,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'updated-notes'
    ),
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'AtomicTag2')]
  )).amount = 999),
  'update_transaction_with_tags returns updated amount'
);

-- 8) Updated fields are persisted
SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes' AND amount = 999) = 1,
  'Updated fields persisted in DB'
);

-- 9) Tags are replaced: AtomicTag2 is now associated
SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   JOIN public.tags tg ON tt.tag_id = tg.id
   WHERE t.user_id = auth.uid() AND t.notes = 'updated-notes' AND tg.name = 'AtomicTag2') = 1,
  'AtomicTag2 is now associated after update'
);

-- 10) Tags are replaced: AtomicTag1 is no longer associated
SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   JOIN public.tags tg ON tt.tag_id = tg.id
   WHERE t.user_id = auth.uid() AND t.notes = 'updated-notes' AND tg.name = 'AtomicTag1') = 0,
  'AtomicTag1 removed after tag replacement'
);

-- 11) update with empty tags: removes all tags
SELECT ok(
  (SELECT (public.update_transaction_with_tags(
    (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes'),
    jsonb_build_object(
      'date', '2026-01-10', 'type', 'spend', 'amount', 999,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'updated-notes'
    ),
    ARRAY[]::uuid[]
  )).id IS NOT NULL),
  'update with empty tags does not error'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   WHERE t.user_id = auth.uid() AND t.notes = 'updated-notes') = 0,
  'All tags removed when updated with empty array'
);

-- Capture user1's transaction id for the cross-user test below, which runs
-- while authenticated as user2 — RLS would otherwise make the inline
-- "WHERE notes = 'updated-notes'" subquery return NULL there.
select set_config(
  'test.user1_txn_id',
  (SELECT id::text FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes'),
  false
);

-- 12) Cross-user: update_transaction_with_tags raises exception for other user's transaction
select tests.authenticate_as('atomic_user2@test.com');

SELECT throws_like(
  $$
    SELECT public.update_transaction_with_tags(
      current_setting('test.user1_txn_id')::uuid,
      jsonb_build_object(
        'date', '2026-01-10', 'type', 'spend', 'amount', 1,
        'category_id', '00000000-0000-0000-0000-000000000000'::uuid,
        'bank_account_id', '00000000-0000-0000-0000-000000000000'::uuid
      ),
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'User2 cannot update User1 transaction'
);

-- 13-18) Cross-user ownership validation: user1 cannot use user2's categories/accounts/tags
select tests.authenticate_as('atomic_user1@test.com');

-- 13) create with other user's category raises access denied
SELECT throws_like(
  $$
    SELECT public.create_transaction_with_tags(
      jsonb_build_object(
        'date', '2026-01-20', 'type', 'spend', 'amount', 1,
        'category_id', current_setting('test.user2_cat_id')::uuid,
        'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount')
      ),
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'Cannot create transaction with another user''s category'
);

-- 14) create with other user's bank account raises access denied
SELECT throws_like(
  $$
    SELECT public.create_transaction_with_tags(
      jsonb_build_object(
        'date', '2026-01-20', 'type', 'spend', 'amount', 1,
        'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
        'bank_account_id', current_setting('test.user2_account_id')::uuid
      ),
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'Cannot create transaction with another user''s bank account'
);

-- 15) create with other user's tag raises access denied
SELECT throws_like(
  $$
    SELECT public.create_transaction_with_tags(
      jsonb_build_object(
        'date', '2026-01-20', 'type', 'spend', 'amount', 1,
        'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
        'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount')
      ),
      ARRAY[current_setting('test.user2_tag_id')::uuid]
    )
  $$,
  '%access denied%',
  'Cannot create transaction with another user''s tag'
);

-- 16) update with other user's category raises access denied
SELECT throws_like(
  $$
    SELECT public.update_transaction_with_tags(
      (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes'),
      jsonb_build_object(
        'date', '2026-01-20', 'type', 'spend', 'amount', 1,
        'category_id', current_setting('test.user2_cat_id')::uuid,
        'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount')
      ),
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'Cannot update transaction with another user''s category'
);

-- 17) update with other user's bank account raises access denied
SELECT throws_like(
  $$
    SELECT public.update_transaction_with_tags(
      (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes'),
      jsonb_build_object(
        'date', '2026-01-20', 'type', 'spend', 'amount', 1,
        'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
        'bank_account_id', current_setting('test.user2_account_id')::uuid
      ),
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'Cannot update transaction with another user''s bank account'
);

-- 18) update with other user's tag raises access denied
SELECT throws_like(
  $$
    SELECT public.update_transaction_with_tags(
      (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes'),
      jsonb_build_object(
        'date', '2026-01-20', 'type', 'spend', 'amount', 1,
        'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
        'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount')
      ),
      ARRAY[current_setting('test.user2_tag_id')::uuid]
    )
  $$,
  '%access denied%',
  'Cannot update transaction with another user''s tag'
);

select * from finish();
ROLLBACK;

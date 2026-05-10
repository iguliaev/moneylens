-- supabase/tests/atomic_transaction_with_tags_test.sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Setup two test users
select tests.create_supabase_user('atomic_user1@test.com');
select tests.create_supabase_user('atomic_user2@test.com');

select tests.authenticate_as('atomic_user1@test.com');

-- Seed reference data for user1
INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'AtomicCat')
ON CONFLICT (user_id, type, name) DO NOTHING;

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

-- 5) Atomicity: invalid tag FK causes rollback — no orphan transaction
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
  '23503'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'orphan-should-not-exist') = 0,
  'No orphan transaction left after tag FK violation'
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

-- 12) Cross-user: update_transaction_with_tags raises exception for other user's transaction
select tests.authenticate_as('atomic_user2@test.com');

SELECT throws_like(
  $$
    SELECT public.update_transaction_with_tags(
      (SELECT id FROM public.transactions WHERE notes = 'updated-notes'),
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

select * from finish();
ROLLBACK;

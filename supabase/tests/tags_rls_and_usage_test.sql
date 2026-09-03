-- tags_rls_and_usage_test.sql
-- Validates tags RLS, uniqueness, updated_at, the junction-based usage view,
-- and the safe-delete RPC. Tag usage is tracked via transaction_tags now that
-- the legacy transactions.tags array column has been dropped
-- (20260831190631_drop_legacy_transaction_denormalized_columns.sql).

begin;
select plan(15);

-- Create and authenticate a dedicated user
select tests.create_supabase_user('tag_user1@test.com');
select tests.authenticate_as('tag_user1@test.com');

-- 1) Insert two tags for current user
select lives_ok(
  $$ insert into public.tags (name, description) values ('groceries', 'food'), ('fun', 'entertainment') $$,
  'can insert tags for current user'
);

-- 2) RLS: other user cannot see tag_user1 tags
select tests.create_supabase_user('tag_user2@test.com');
select tests.authenticate_as('tag_user2@test.com');
select is(
  (select count(*) from public.tags),
  0::bigint,
  'other user cannot see tag_user1 tags'
);

-- 3) Switch back to tag_user1
select tests.authenticate_as('tag_user1@test.com');

-- 4) updated_at maintained on update
select lives_ok(
  $$ update public.tags set description = 'food & household' where name = 'groceries' $$,
  'can update description'
);
select ok(
  (select updated_at >= created_at from public.tags where name = 'groceries'),
  'updated_at was bumped'
);

-- 5) unique per user
select throws_like(
  $$ insert into public.tags (name) values ('groceries') $$,
  '%uq_tags_user_name%',
  'unique(user_id, name) enforced'
);

-- 6) usage: create a transaction and link the 'fun' tag via the junction table
select lives_ok(
  $$ insert into public.transactions (user_id, date, type, amount)
     values (auth.uid(), '2025-08-01', 'spend', 10) $$,
  'insert transaction'
);
select lives_ok(
  $$ insert into public.transaction_tags (transaction_id, tag_id)
     select t.id, g.id
     from public.transactions t
     cross join public.tags g
     where t.user_id = auth.uid() and t.amount = 10
       and g.user_id = auth.uid() and g.name = 'fun' $$,
  'link fun tag to transaction via transaction_tags'
);

-- 7) view shows junction-based usage counts
select bag_eq(
  $$ select name, in_use_count from public.tags_with_usage where user_id = auth.uid() order by name $$,
  $$ values ('fun', 1::bigint), ('groceries', 0::bigint) $$,
  'tags_with_usage shows reference counts from transaction_tags'
);

-- 8) safe delete: in-use tag cannot be deleted
select row_eq(
  $$ select x.ok, x.in_use_count from public.delete_tag_safe((select id from public.tags where name = 'fun')) as x $$,
  row(false, 1::bigint),
  'delete_tag_safe returns ok=false and count=1 for in-use tag'
);

-- 9) safe delete: unused can be deleted
select row_eq(
  $$ select x.ok, x.in_use_count from public.delete_tag_safe((select id from public.tags where name = 'groceries')) as x $$,
  row(true, 0::bigint),
  'delete_tag_safe returns ok=true for unused tag'
);

-- 10) soft-deleted tag no longer appears in tags_with_usage, but the row still
--     exists in tags with deleted_at set (soft, not hard, delete)
select is(
  (select count(*) from public.tags_with_usage where user_id = auth.uid() and name = 'groceries'),
  0::bigint,
  'soft-deleted tag is filtered out of tags_with_usage'
);
select ok(
  (select deleted_at is not null from public.tags where user_id = auth.uid() and name = 'groceries'),
  'delete_tag_safe soft-deletes the tag row (deleted_at set, row retained)'
);

-- 11) a tag whose only transaction is soft-deleted is not counted as in-use:
--     exercises the view's `AND t.deleted_at IS NULL` on the junction->transactions
--     join (and the matching predicate in delete_tag_safe). Setup is split across
--     statements because the transaction_tags RLS WITH CHECK can't see a row
--     inserted by a sibling CTE.
insert into public.tags (name) values ('archived');
insert into public.transactions (user_id, date, type, amount)
  values (auth.uid(), '2025-09-01', 'spend', 42);
select lives_ok($$
  insert into public.transaction_tags (transaction_id, tag_id)
  select t.id, g.id
  from public.transactions t
  cross join public.tags g
  where t.user_id = auth.uid() and t.amount = 42
    and g.user_id = auth.uid() and g.name = 'archived'
$$, 'link archived tag to a transaction');
update public.transactions set deleted_at = now()
  where user_id = auth.uid() and amount = 42;
select is(
  (select in_use_count from public.tags_with_usage where user_id = auth.uid() and name = 'archived'),
  0::bigint,
  'tag linked only to a soft-deleted transaction has in_use_count = 0'
);
select row_eq(
  $$ select x.ok, x.in_use_count from public.delete_tag_safe((select id from public.tags where name = 'archived')) as x $$,
  row(true, 0::bigint),
  'delete_tag_safe allows deleting a tag whose only transaction is soft-deleted'
);

select * from finish();
rollback;

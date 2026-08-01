-- S4: transactions.user_id was nullable with no ON DELETE action, unlike every other
-- user-owned table (categories, bank_accounts, tags, budgets, user_settings), which are
-- all NOT NULL ... REFERENCES auth.users (id) ON DELETE CASCADE.
alter table public.transactions drop constraint transactions_user_id_fkey;
alter table public.transactions alter column user_id set not null;
alter table public.transactions
  add constraint transactions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

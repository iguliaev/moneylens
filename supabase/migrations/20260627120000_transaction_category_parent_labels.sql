-- Add parent category names to transaction/category views used by web UI.
-- This enables consistent Parent / Child rendering without extra per-row fetches.

CREATE OR REPLACE VIEW public.transactions_with_details
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name AS category_name,
  p.name AS category_parent_name,
  c.type AS category_type,
  t.bank_account_id,
  ba.name AS bank_account_name,
  t.created_at,
  t.updated_at,
  ARRAY_REMOVE(
    ARRAY_AGG(DISTINCT tt.tag_id ORDER BY tt.tag_id),
    NULL
  ) AS tag_ids,
  ARRAY_REMOVE(
    ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name),
    NULL
  ) AS tag_names
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.categories p ON c.parent_id = p.id
LEFT JOIN public.bank_accounts ba ON t.bank_account_id = ba.id
LEFT JOIN public.transaction_tags tt ON t.id = tt.transaction_id
LEFT JOIN public.tags tg ON tt.tag_id = tg.id
WHERE t.deleted_at IS NULL
GROUP BY
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name,
  p.name,
  c.type,
  t.bank_account_id,
  ba.name,
  t.created_at,
  t.updated_at;

COMMENT ON VIEW public.transactions_with_details IS
  'Transactions with resolved category, parent category, bank account, and tag names for UI display';

CREATE OR REPLACE VIEW public.categories_with_usage
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.user_id,
  c.type,
  c.name,
  c.description,
  c.parent_id,
  p.name AS parent_name,
  -- Sort key: root categories sort by own name; children sort under their parent.
  -- chr(1) is below any printable character so "Food" < "Food\x01Groceries".
  COALESCE(p.name || chr(1) || c.name, c.name) AS sort_label,
  COALESCE(ch_kids.child_count, 0)::bigint AS child_count,
  c.created_at,
  c.updated_at,
  COALESCE(u.cnt, 0::bigint) AS in_use_count
FROM public.categories c
LEFT JOIN public.categories p ON c.parent_id = p.id
LEFT JOIN (
  SELECT
    public.transactions.user_id,
    public.transactions.category_id,
    count(*) AS cnt
  FROM public.transactions
  WHERE public.transactions.category_id IS NOT NULL
    AND public.transactions.deleted_at IS NULL
  GROUP BY public.transactions.user_id, public.transactions.category_id
) u ON u.user_id = c.user_id AND u.category_id = c.id
LEFT JOIN (
  SELECT ancestor_id, count(*) AS child_count
  FROM public.category_hierarchy
  WHERE depth = 1
  GROUP BY ancestor_id
) ch_kids ON ch_kids.ancestor_id = c.id
WHERE c.deleted_at IS NULL;

COMMENT ON VIEW public.categories_with_usage IS
  'Categories with usage count, parent name, parent_id, and child_count for hierarchy-aware UI.';

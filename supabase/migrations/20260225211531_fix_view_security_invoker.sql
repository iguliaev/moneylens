-- Migration: Fix views to use SECURITY INVOKER instead of SECURITY DEFINER
-- This migration drops and recreates all views with the security_invoker = TRUE option
-- to ensure they enforce RLS and permissions of the querying user, not the view creator.
-- Drop all views (in reverse dependency order)
DROP VIEW IF EXISTS public.tags_with_usage CASCADE;

DROP VIEW IF EXISTS public.bank_accounts_with_usage CASCADE;

DROP VIEW IF EXISTS public.categories_with_usage CASCADE;

DROP VIEW IF EXISTS public.transactions_with_details CASCADE;

DROP VIEW IF EXISTS public.view_tagged_type_totals CASCADE;

DROP VIEW IF EXISTS public.view_yearly_tagged_type_totals CASCADE;

DROP VIEW IF EXISTS public.view_monthly_tagged_type_totals CASCADE;

DROP VIEW IF EXISTS public.view_yearly_category_totals CASCADE;

DROP VIEW IF EXISTS public.view_monthly_category_totals CASCADE;

DROP VIEW IF EXISTS public.view_yearly_totals CASCADE;

DROP VIEW IF EXISTS public.view_monthly_totals CASCADE;

DROP VIEW IF EXISTS public.transactions_save CASCADE;

DROP VIEW IF EXISTS public.transactions_earn CASCADE;

DROP VIEW IF EXISTS public.transactions_spend CASCADE;

-- Recreate all views with SECURITY INVOKER
CREATE OR REPLACE VIEW
  public.transactions_spend
WITH
  (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.type,
  t.category_id,
  COALESCE(t.category, c.name) AS category,
  t.bank_account_id,
  COALESCE(t.bank_account, b.name) AS bank_account,
  t.amount,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at
FROM
  transactions t
  LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
  LEFT JOIN categories c ON t.category_id = c.id
WHERE
  t.type = 'spend'::transaction_type;

CREATE OR REPLACE VIEW
  public.transactions_earn
WITH
  (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.type,
  t.category_id,
  COALESCE(t.category, c.name) AS category,
  t.bank_account_id,
  COALESCE(t.bank_account, b.name) AS bank_account,
  t.amount,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at
FROM
  transactions t
  LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
  LEFT JOIN categories c ON t.category_id = c.id
WHERE
  t.type = 'earn'::transaction_type;

CREATE OR REPLACE VIEW
  public.transactions_save
WITH
  (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.type,
  t.category_id,
  COALESCE(t.category, c.name) AS category,
  t.bank_account_id,
  COALESCE(t.bank_account, b.name) AS bank_account,
  t.amount,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at
FROM
  transactions t
  LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
  LEFT JOIN categories c ON t.category_id = c.id
WHERE
  t.type = 'save'::transaction_type;

CREATE OR REPLACE VIEW
  public.view_monthly_totals
WITH
  (security_invoker = TRUE) AS
SELECT
  user_id,
  DATE_TRUNC('month', date) AS MONTH,
TYPE,
SUM(amount) AS total
FROM
  transactions
GROUP BY
  user_id,
  MONTH,
TYPE
ORDER BY
  user_id,
  MONTH DESC,
TYPE;

CREATE OR REPLACE VIEW
  public.view_yearly_totals
WITH
  (security_invoker = TRUE) AS
SELECT
  user_id,
  DATE_TRUNC('year', date) AS YEAR,
TYPE,
SUM(amount) AS total
FROM
  transactions
GROUP BY
  user_id,
  YEAR,
TYPE
ORDER BY
  user_id,
  YEAR DESC,
TYPE;

CREATE OR REPLACE VIEW
  public.view_monthly_category_totals
WITH
  (security_invoker = TRUE) AS
SELECT
  t.user_id,
  DATE_TRUNC('month', t.date) AS MONTH,
  c.name AS category,
  t.type,
  SUM(t.amount) AS total
FROM
  transactions t
  JOIN categories c ON t.category_id = c.id
GROUP BY
  t.user_id,
  DATE_TRUNC('month', t.date),
  c.name,
  t.type
ORDER BY
  t.user_id,
  MONTH DESC,
  category,
  t.type;

CREATE OR REPLACE VIEW
  public.view_yearly_category_totals
WITH
  (security_invoker = TRUE) AS
SELECT
  t.user_id,
  DATE_TRUNC('year', t.date) AS YEAR,
  c.name AS category,
  t.type,
  SUM(t.amount) AS total
FROM
  transactions t
  JOIN categories c ON t.category_id = c.id
GROUP BY
  t.user_id,
  DATE_TRUNC('year', t.date),
  c.name,
  t.type
ORDER BY
  t.user_id,
  YEAR DESC,
  category,
  t.type;

CREATE OR REPLACE VIEW
  public.view_monthly_tagged_type_totals
WITH
  (security_invoker = TRUE) AS
WITH
  transaction_tags_array AS (
    SELECT
      t.id,
      t.user_id,
      t.date,
      t.type,
      t.amount,
      ARRAY_REMOVE(
        ARRAY_AGG(
          DISTINCT tg.name
          ORDER BY
            tg.name
        ),
        NULL
      ) AS tags
    FROM
      transactions t
      LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
    GROUP BY
      t.id,
      t.user_id,
      t.date,
      t.type,
      t.amount
  )
SELECT
  user_id,
  DATE_TRUNC('month', date) AS MONTH,
TYPE,
tags,
SUM(amount) AS total
FROM
  transaction_tags_array
WHERE
  tags IS NOT NULL
  AND ARRAY_LENGTH(tags, 1) > 0
GROUP BY
  user_id,
  DATE_TRUNC('month', date),
TYPE,
tags;

CREATE OR REPLACE VIEW
  public.view_yearly_tagged_type_totals
WITH
  (security_invoker = TRUE) AS
WITH
  transaction_tags_array AS (
    SELECT
      t.id,
      t.user_id,
      t.date,
      t.type,
      t.amount,
      ARRAY_REMOVE(
        ARRAY_AGG(
          DISTINCT tg.name
          ORDER BY
            tg.name
        ),
        NULL
      ) AS tags
    FROM
      transactions t
      LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
    GROUP BY
      t.id,
      t.user_id,
      t.date,
      t.type,
      t.amount
  )
SELECT
  user_id,
  DATE_TRUNC('year', date) AS YEAR,
TYPE,
tags,
SUM(amount) AS total
FROM
  transaction_tags_array
WHERE
  tags IS NOT NULL
  AND ARRAY_LENGTH(tags, 1) > 0
GROUP BY
  user_id,
  DATE_TRUNC('year', date),
TYPE,
tags;

CREATE OR REPLACE VIEW
  public.view_tagged_type_totals
WITH
  (security_invoker = TRUE) AS
WITH
  transaction_tags_array AS (
    SELECT
      t.id,
      t.user_id,
      t.type,
      t.amount,
      ARRAY_REMOVE(
        ARRAY_AGG(
          DISTINCT tg.name
          ORDER BY
            tg.name
        ),
        NULL
      ) AS tags
    FROM
      transactions t
      LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
    GROUP BY
      t.id,
      t.user_id,
      t.type,
      t.amount
  )
SELECT
  user_id,
TYPE,
tags,
SUM(amount) AS total
FROM
  transaction_tags_array
WHERE
  tags IS NOT NULL
  AND ARRAY_LENGTH(tags, 1) > 0
GROUP BY
  user_id,
TYPE,
tags;

CREATE OR REPLACE VIEW
  public.transactions_with_details
WITH
  (security_invoker = TRUE) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name AS category_name,
  c.type AS category_type,
  t.bank_account_id,
  ba.name AS bank_account_name,
  t.created_at,
  t.updated_at,
  ARRAY_REMOVE(
    ARRAY_AGG(
      DISTINCT tt.tag_id
      ORDER BY
        tt.tag_id
    ),
    NULL
  ) AS tag_ids,
  ARRAY_REMOVE(
    ARRAY_AGG(
      DISTINCT tg.name
      ORDER BY
        tg.name
    ),
    NULL
  ) AS tag_names
FROM
  transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN bank_accounts ba ON t.bank_account_id = ba.id
  LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
  LEFT JOIN tags tg ON tt.tag_id = tg.id
GROUP BY
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name,
  c.type,
  t.bank_account_id,
  ba.name,
  t.created_at,
  t.updated_at;

COMMENT ON VIEW public.transactions_with_details IS 'Transactions with resolved category, bank account, and tag names for UI display';

CREATE OR REPLACE VIEW
  public.categories_with_usage
WITH
  (security_invoker = TRUE) AS
SELECT
  c.id,
  c.user_id,
  c.type,
  c.name,
  c.description,
  c.created_at,
  c.updated_at,
  COALESCE(u.cnt, 0)::BIGINT AS in_use_count
FROM
  public.categories c
  LEFT JOIN (
    SELECT
      user_id,
      category_id,
      COUNT(*)::BIGINT AS cnt
    FROM
      public.transactions
    WHERE
      category_id IS NOT NULL
    GROUP BY
      user_id,
      category_id
  ) u ON u.user_id = c.user_id
  AND u.category_id = c.id;

COMMENT ON VIEW public.categories_with_usage IS 'Per-user categories with reference counts from transactions (in_use_count).';

CREATE OR REPLACE VIEW
  public.bank_accounts_with_usage
WITH
  (security_invoker = TRUE) AS
SELECT
  b.id,
  b.user_id,
  b.name,
  b.description,
  b.created_at,
  b.updated_at,
  COALESCE(u.cnt, 0)::BIGINT AS in_use_count
FROM
  public.bank_accounts b
  LEFT JOIN (
    SELECT
      user_id,
      bank_account_id,
      COUNT(*)::BIGINT AS cnt
    FROM
      public.transactions
    WHERE
      bank_account_id IS NOT NULL
    GROUP BY
      user_id,
      bank_account_id
  ) u ON u.user_id = b.user_id
  AND u.bank_account_id = b.id;

COMMENT ON VIEW public.bank_accounts_with_usage IS 'Per-user bank accounts with reference counts from transactions (in_use_count).';

CREATE OR REPLACE VIEW
  public.tags_with_usage
WITH
  (security_invoker = TRUE) AS
SELECT
  g.id,
  g.user_id,
  g.name,
  g.description,
  g.created_at,
  g.updated_at,
  COALESCE(u.cnt, 0)::BIGINT AS in_use_count
FROM
  public.tags g
  LEFT JOIN (
    SELECT
      tr.user_id,
      x.tag,
      COUNT(*)::BIGINT AS cnt
    FROM
      public.transactions tr
      CROSS JOIN LATERAL UNNEST(tr.tags) AS x (tag)
    GROUP BY
      tr.user_id,
      x.tag
  ) u ON u.user_id = g.user_id
  AND u.tag = g.name;

COMMENT ON VIEW public.tags_with_usage IS 'Per-user tags with reference counts from transactions (in_use_count).';
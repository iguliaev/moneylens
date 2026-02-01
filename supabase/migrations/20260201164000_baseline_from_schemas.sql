-- ============================================================================
-- Migration: 20260201164000_baseline_from_schemas.sql
-- Purpose: Baseline migration created from declarative schema files
-- Date: 2026-02-01 16:40:00 UTC
-- 
-- This migration replaces all previous migrations (20250910175628 through 20260117175519)
-- and establishes a clean baseline from the declarative schema files in supabase/schemas/.
--
-- Files are ordered to respect dependencies:
-- 1. Functions and types (no dependencies)
-- 2. Base tables (categories, bank_accounts, tags)
-- 3. Transactions table (depends on categories, bank_accounts)
-- 4. Junction tables (transaction_tags - depends on transactions) 
-- 5. RLS policies
-- 6. Views and functions (depend on tables)
-- ============================================================================
-- ============================================================================
-- Source: supabase/schemas/000_common_functions.sql
-- ============================================================================
-- Keep updated_at fresh on UPDATE
CREATE
OR REPLACE FUNCTION public.tg_set_updated_at () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
    -- clock_timestamp() returns the actual wall-clock time, not the transaction start time
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

-- Auto-assign user_id from auth.uid() on INSERT so clients don't send it
CREATE
OR REPLACE FUNCTION public.tg_set_user_id () RETURNS TRIGGER LANGUAGE plpgsql
-- Harden search_path (Option: empty) so only fully-qualified names resolve.
SET
  search_path = '' AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Source: supabase/schemas/000_transaction_type.sql
-- ============================================================================
-- Create enum type for transaction type if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('earn', 'spend', 'save');
    END IF;
END$$;

-- ============================================================================
-- Source: supabase/schemas/001_categories.sql
-- ============================================================================
-- 001_categories.sql
-- Create categories table for user-defined transaction categories
CREATE TABLE IF NOT EXISTS
  categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    TYPE transaction_type NOT NULL,
    NAME TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

-- Index for fast lookup by user and type
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON categories (
  user_id,
  TYPE
);

-- Unique constraint: each user cannot have duplicate category names per type
ALTER TABLE categories
ADD CONSTRAINT unique_user_type_name UNIQUE (
  user_id,
  TYPE,
  NAME
);

-- ============================================================================
-- Source: supabase/schemas/001_bank_accounts.sql
-- ============================================================================
-- 001_bank_accounts.sql
-- Per-user bank accounts dictionary
CREATE TABLE IF NOT EXISTS
  public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    NAME TEXT NOT NULL,
    description TEXT,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_accounts_user_name UNIQUE (user_id, NAME)
  );

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON public.bank_accounts (user_id);

-- ============================================================================
-- Source: supabase/schemas/012_tags.sql
-- ============================================================================
-- 012_tags.sql
-- Base table for per-user Tags dictionary (no RLS/policies here; see next file)
CREATE TABLE IF NOT EXISTS
  public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    NAME TEXT NOT NULL,
    description TEXT,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tags_user_name UNIQUE (user_id, NAME)
  );

CREATE INDEX IF NOT EXISTS idx_tags_user ON public.tags (user_id);

COMMENT ON TABLE public.tags IS 'Per-user predefined tags (dictionary).';

COMMENT ON COLUMN public.tags.name IS 'Tag label unique per user.';

-- ============================================================================
-- Source: supabase/schemas/003_transactions.sql
-- ============================================================================
CREATE TABLE
  transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID REFERENCES auth.users (id),
    date date NOT NULL,
    TYPE transaction_type NOT NULL,
    category TEXT, -- Obsolete field, do not use
    category_id UUID REFERENCES categories (id),
    amount NUMERIC(12, 2) NOT NULL,
    tags TEXT[],
    notes TEXT,
    bank_account TEXT, -- Obsolete field, do not use
    bank_account_id UUID REFERENCES bank_accounts (id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

-- ============================================================================
-- Source: supabase/schemas/013_transaction_tags.sql
-- ============================================================================
-- 013_transaction_tags.sql
-- Junction table for many-to-many relationship between transactions and tags
CREATE TABLE IF NOT EXISTS
  public.transaction_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    transaction_id UUID NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_transaction_tag UNIQUE (transaction_id, tag_id)
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_tags_transaction ON public.transaction_tags (transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON public.transaction_tags (tag_id);

-- Add comments
COMMENT ON TABLE public.transaction_tags IS 'Many-to-many relationship between transactions and tags';

COMMENT ON COLUMN public.transaction_tags.transaction_id IS 'Reference to transaction';

COMMENT ON COLUMN public.transaction_tags.tag_id IS 'Reference to tag';

-- ============================================================================
-- Source: supabase/schemas/002_categories_rls.sql
-- ============================================================================
-- Enable Row-Level Security (RLS) for categories table
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Drop legacy broad policy if present to avoid overlap
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'Allow owner full access'
    ) THEN
        EXECUTE 'DROP POLICY "Allow owner full access" ON public.categories';
    END IF;
END $$;

-- Owner-only CRUD policies
DROP POLICY IF EXISTS categories_select ON public.categories;

CREATE POLICY categories_select ON public.categories FOR
SELECT
  USING (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS categories_insert ON public.categories;

CREATE POLICY categories_insert ON public.categories FOR INSERT
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS categories_update ON public.categories;

CREATE POLICY categories_update ON public.categories FOR
UPDATE USING (
  user_id = (
    SELECT
      auth.uid ()
  )
)
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS categories_delete ON public.categories;

CREATE POLICY categories_delete ON public.categories FOR DELETE USING (
  user_id = (
    SELECT
      auth.uid ()
  )
);

DROP TRIGGER IF EXISTS set_user_id_on_categories ON public.categories;

CREATE TRIGGER set_user_id_on_categories BEFORE INSERT ON public.categories FOR EACH ROW
EXECUTE FUNCTION public.tg_set_user_id ();

DROP TRIGGER IF EXISTS set_updated_at_on_categories ON public.categories;

CREATE TRIGGER set_updated_at_on_categories BEFORE
UPDATE ON public.categories FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at ();

-- Optional: allow selecting from the view through PostgREST with owner scoping
DO $$
BEGIN
    -- Views inherit RLS from base tables; explicit policy on the view is not required.
    -- This block is a no-op placeholder to document intent and future changes.
    PERFORM 1;
END $$;

-- ============================================================================
-- Source: supabase/schemas/009_bank_accounts_rls.sql
-- ============================================================================
-- 009_bank_accounts_rls.sql
-- Enable RLS and owner-only policies for bank_accounts; add user_id and updated_at triggers
ALTER TABLE IF EXISTS public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_accounts_select ON public.bank_accounts;

CREATE POLICY bank_accounts_select ON public.bank_accounts FOR
SELECT
  USING (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS bank_accounts_insert ON public.bank_accounts;

CREATE POLICY bank_accounts_insert ON public.bank_accounts FOR INSERT
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS bank_accounts_update ON public.bank_accounts;

CREATE POLICY bank_accounts_update ON public.bank_accounts FOR
UPDATE USING (
  user_id = (
    SELECT
      auth.uid ()
  )
)
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS bank_accounts_delete ON public.bank_accounts;

CREATE POLICY bank_accounts_delete ON public.bank_accounts FOR DELETE USING (
  user_id = (
    SELECT
      auth.uid ()
  )
);

DROP TRIGGER IF EXISTS set_user_id_on_bank_accounts ON public.bank_accounts;

CREATE TRIGGER set_user_id_on_bank_accounts BEFORE INSERT ON public.bank_accounts FOR EACH ROW
EXECUTE FUNCTION public.tg_set_user_id ();

-- Keep updated_at fresh on UPDATE (reuse tg_set_updated_at from categories)
DROP TRIGGER IF EXISTS set_updated_at_on_bank_accounts ON public.bank_accounts;

CREATE TRIGGER set_updated_at_on_bank_accounts BEFORE
UPDATE ON public.bank_accounts FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at ();

-- ============================================================================
-- Source: supabase/schemas/013_tags_rls.sql
-- ============================================================================
-- 013_tags_rls.sql
-- Enable RLS and owner-only policies for tags; add user_id and updated_at triggers
ALTER TABLE IF EXISTS public.tags ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS tags_select ON public.tags;

CREATE POLICY tags_select ON public.tags FOR
SELECT
  USING (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS tags_insert ON public.tags;

CREATE POLICY tags_insert ON public.tags FOR INSERT
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS tags_update ON public.tags;

CREATE POLICY tags_update ON public.tags FOR
UPDATE USING (
  user_id = (
    SELECT
      auth.uid ()
  )
)
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

DROP POLICY IF EXISTS tags_delete ON public.tags;

CREATE POLICY tags_delete ON public.tags FOR DELETE USING (
  user_id = (
    SELECT
      auth.uid ()
  )
);

DROP TRIGGER IF EXISTS set_user_id_on_tags ON public.tags;

CREATE TRIGGER set_user_id_on_tags BEFORE INSERT ON public.tags FOR EACH ROW
EXECUTE FUNCTION public.tg_set_user_id ();

-- Keep updated_at fresh on UPDATE (reuse tg_set_updated_at from categories)
DROP TRIGGER IF EXISTS set_updated_at_on_tags ON public.tags;

CREATE TRIGGER set_updated_at_on_tags BEFORE
UPDATE ON public.tags FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at ();

-- ============================================================================
-- Source: supabase/schemas/014_transaction_tags_policies.sql
-- ============================================================================
-- 014_transaction_tags_policies.sql
-- Row Level Security policies for transaction_tags
-- Enable RLS
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;

-- Users can view their own transaction-tag associations
CREATE POLICY "Users can view own transaction tags" ON public.transaction_tags FOR
SELECT
  USING (
    EXISTS (
      SELECT
        1
      FROM
        public.transactions
      WHERE
        transactions.id = transaction_tags.transaction_id
        AND transactions.user_id = auth.uid ()
    )
  );

-- Users can insert their own transaction-tag associations
CREATE POLICY "Users can insert own transaction tags" ON public.transaction_tags FOR INSERT
WITH
  CHECK (
    EXISTS (
      SELECT
        1
      FROM
        public.transactions
      WHERE
        transactions.id = transaction_tags.transaction_id
        AND transactions.user_id = auth.uid ()
    )
    AND EXISTS (
      SELECT
        1
      FROM
        public.tags
      WHERE
        tags.id = transaction_tags.tag_id
        AND tags.user_id = auth.uid ()
    )
  );

-- Users can delete their own transaction-tag associations
CREATE POLICY "Users can delete own transaction tags" ON public.transaction_tags FOR DELETE USING (
  EXISTS (
    SELECT
      1
    FROM
      public.transactions
    WHERE
      transactions.id = transaction_tags.transaction_id
      AND transactions.user_id = auth.uid ()
  )
);

-- Note: No UPDATE policy needed - associations are immutable (delete + insert instead)
-- ============================================================================
-- Source: supabase/schemas/004_transactions_rls.sql
-- ============================================================================
-- Enable Row-Level Security (RLS) on transactions table
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Add user_id column if not present (uncomment if needed)
-- ALTER TABLE transactions ADD COLUMN user_id uuid REFERENCES auth.users(id);
-- Policy: Users can view their own transactions
CREATE POLICY "Users can view their own transactions" ON transactions FOR
SELECT
  USING (
    (
      SELECT
        auth.uid ()
    ) = user_id
  );

-- Policy: Users can insert their own transactions
CREATE POLICY "Users can insert their own transactions" ON transactions FOR INSERT
WITH
  CHECK (
    (
      SELECT
        auth.uid ()
    ) = user_id
  );

-- Policy: Users can update their own transactions
CREATE POLICY "Users can update their own transactions" ON transactions FOR
UPDATE USING (
  (
    SELECT
      auth.uid ()
  ) = user_id
);

-- Policy: Users can delete their own transactions
CREATE POLICY "Users can delete their own transactions" ON transactions FOR DELETE USING (
  (
    SELECT
      auth.uid ()
  ) = user_id
);

-- Enforce RLS
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Source: supabase/schemas/007_transactions_category_fk.sql
-- ============================================================================
-- Enforce that transaction type matches category type using a trigger
CREATE
OR REPLACE FUNCTION check_transaction_category_type () RETURNS TRIGGER LANGUAGE plpgsql
-- Harden search_path: restrict to pg_catalog; schema-qualify table references.
SET
  search_path = '' AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    IF NEW.type IS DISTINCT FROM (SELECT type FROM public.categories WHERE id = NEW.category_id) THEN
      RAISE EXCEPTION 'Transaction type (%) does not match category type (%)', NEW.type, (SELECT type FROM public.categories WHERE id = NEW.category_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transaction_category_type_trigger BEFORE INSERT
OR
UPDATE ON public.transactions FOR EACH ROW
EXECUTE FUNCTION check_transaction_category_type ();

-- ============================================================================
-- Source: supabase/schemas/010_transactions_bank_account_fk.sql
-- ============================================================================
-- 010_transactions_bank_account_fk.sql
-- Enforce bank account belongs to same user
CREATE
OR REPLACE FUNCTION public.check_transaction_bank_account () RETURNS TRIGGER LANGUAGE plpgsql
-- Harden search_path: empty string; all references are schema-qualified or local NEW.*
SET
  search_path = '' AS $$
begin
  if new.bank_account_id is not null then
    if not exists (
      select 1 from public.bank_accounts b
      where b.id = new.bank_account_id and b.user_id = new.user_id
    ) then
      raise exception 'Bank account does not belong to the user' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS transaction_bank_account_check ON public.transactions;

CREATE TRIGGER transaction_bank_account_check BEFORE INSERT
OR
UPDATE ON public.transactions FOR EACH ROW
EXECUTE FUNCTION public.check_transaction_bank_account ();

-- ============================================================================
-- Source: supabase/schemas/005_delete_category_safe.sql
-- ============================================================================
-- Safe delete function for categories
-- Allows deletion only when the category is not referenced by any transactions
-- Returns ok=false and the referencing count instead of raising a foreign key error
CREATE
OR REPLACE FUNCTION public.delete_category_safe (p_category_id UUID) RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT) LANGUAGE plpgsql SECURITY DEFINER
-- Harden search_path: only pg_catalog (all object references are schema-qualified)
SET
  search_path = '' AS $$
declare
  v_uid uuid;
begin
  -- Ensure caller is authenticated
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Ensure the category exists and belongs to the caller
  if not exists (
    select 1 from public.categories c where c.id = p_category_id and c.user_id = v_uid
  ) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  -- Count references
  select count(*) into in_use_count
  from public.transactions t
  where t.category_id = p_category_id and t.user_id = v_uid;

  if in_use_count > 0 then
    ok := false;
    return;
  end if;

  -- Not referenced: delete it
  delete from public.categories c where c.id = p_category_id and c.user_id = v_uid;
  ok := true;
  in_use_count := 0;
  return;
end;
$$;

GRANT
EXECUTE ON FUNCTION public.delete_category_safe (UUID) TO authenticated;

-- ============================================================================
-- Source: supabase/schemas/005_transactions_views.sql
-- ============================================================================
-- Views for spendings, earnings, and savings (using enum comparison)
CREATE OR REPLACE VIEW
  transactions_spend
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
  transactions_earn
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
  transactions_save
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

-- ============================================================================
CREATE OR REPLACE VIEW
  view_monthly_totals
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

-- ============================================
CREATE OR REPLACE VIEW
  view_yearly_totals
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

-- ============================================================================
CREATE OR REPLACE VIEW
  view_monthly_category_totals
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

-- ============================================================================
CREATE OR REPLACE VIEW
  view_yearly_category_totals
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

-- ============================================================================
CREATE OR REPLACE VIEW
  view_monthly_tagged_type_totals
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

-- ============================================================================
CREATE OR REPLACE VIEW
  view_yearly_tagged_type_totals
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

-- ============================================================================
CREATE OR REPLACE VIEW
  view_tagged_type_totals
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

-- Create a comprehensive view for transactions with all related data
-- This view is used for displaying transactions list in the UI with resolved names
CREATE OR REPLACE VIEW
  transactions_with_details
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

-- Add comment explaining the view
COMMENT ON VIEW transactions_with_details IS 'Transactions with resolved category, bank account, and tag names for UI display';

-- ============================================================================
-- Source: supabase/schemas/006_categories_with_usage_view.sql
-- ============================================================================
-- View: categories_with_usage
-- Exposes per-user usage counts (number of transactions referencing each category)
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

-- ============================================================================
-- Source: supabase/schemas/006_trnsactions_functions.sql
-- ============================================================================
-- Sum filtered transactions amount by category_id (RLS-aware)
-- New RPC that prefers category_id over legacy text category.
CREATE
OR REPLACE FUNCTION public.sum_transactions_amount (
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_type public.transaction_type DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_bank_account TEXT DEFAULT NULL,
  p_tags_any TEXT[] DEFAULT NULL,
  p_tags_all TEXT[] DEFAULT NULL
) RETURNS NUMERIC LANGUAGE SQL STABLE
SET
  search_path = '' AS $$
  select coalesce(sum(t.amount), 0)::numeric
  from public.transactions t
  where (p_from is null or t.date >= p_from)
    and (p_to is null or t.date <= p_to)
    and (p_type is null or t.type = p_type)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_bank_account is null or t.bank_account = p_bank_account)
    and (p_tags_any is null or t.tags && p_tags_any)
    and (p_tags_all is null or t.tags @> p_tags_all);
$$;

-- Permissions
GRANT
EXECUTE ON FUNCTION public.sum_transactions_amount (
  date,
  date,
  public.transaction_type,
  UUID,
  TEXT,
  TEXT[],
  TEXT[]
) TO authenticated;

-- Enforce that all tags used on a transaction exist in the user's tags dictionary
CREATE
OR REPLACE FUNCTION public.enforce_known_tags () RETURNS TRIGGER LANGUAGE plpgsql
-- Harden search_path: restrict to ""; table refs are schema-qualified.
SET
  search_path = '' AS $$
declare
  missing text;
begin
  -- Allow null or empty arrays
  if new.tags is null or array_length(new.tags, 1) is null then
    return new;
  end if;

  select t.tag into missing
  from unnest(new.tags) as t(tag)
  where not exists (
    select 1 from public.tags g
    where g.user_id = coalesce(auth.uid(), new.user_id) and g.name = t.tag
  )
  limit 1;

  if missing is not null then
    raise exception 'Unknown tag for this user: %', missing using errcode = '23514';
  end if;

  return new;
end$$;

DROP TRIGGER IF EXISTS enforce_known_tags_trg ON public.transactions;

CREATE TRIGGER enforce_known_tags_trg BEFORE INSERT
OR
UPDATE ON public.transactions FOR EACH ROW
EXECUTE FUNCTION public.enforce_known_tags ();

DROP TRIGGER IF EXISTS set_user_id_on_transactions ON public.transactions;

CREATE TRIGGER set_user_id_on_transactions BEFORE INSERT ON public.transactions FOR EACH ROW
EXECUTE FUNCTION public.tg_set_user_id ();

-- ============================================================================
-- Source: supabase/schemas/011_bank_accounts_usage_and_rpc.sql
-- ============================================================================
-- 011_bank_accounts_usage_and_rpc.sql
-- View bank_accounts_with_usage and delete_bank_account_safe RPC
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

CREATE
OR REPLACE FUNCTION public.delete_bank_account_safe (p_bank_account_id UUID) RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT) LANGUAGE plpgsql
SET
  search_path = '' AS $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.bank_accounts b where b.id = p_bank_account_id and b.user_id = v_uid
  ) then
    raise exception 'Bank account not found' using errcode = 'P0002';
  end if;

  select count(*) into in_use_count
  from public.transactions t
  where t.bank_account_id = p_bank_account_id and t.user_id = v_uid;

  if in_use_count > 0 then
    -- Emit a single row indicating it's in use
    return query select false::boolean as ok, in_use_count::bigint;
    return;
  end if;

  delete from public.bank_accounts b where b.id = p_bank_account_id and b.user_id = v_uid;
  -- Emit success row
  return query select true::boolean as ok, 0::bigint as in_use_count;
  return;
end;
$$;

GRANT
EXECUTE ON FUNCTION public.delete_bank_account_safe (UUID) TO authenticated;

-- ============================================================================
-- Source: supabase/schemas/014_tags_usage_and_rpc.sql
-- ============================================================================
-- 014_tags_usage_and_rpc.sql
-- View tags_with_usage and delete_tag_safe RPC
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

-- Delete tag only when not used by any transaction of the current user
CREATE
OR REPLACE FUNCTION public.delete_tag_safe (p_tag_id UUID) RETURNS TABLE (ok BOOLEAN, in_use_count BIGINT) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_in_use_count bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select name into v_name
  from public.tags
  where id = p_tag_id and user_id = v_uid;

  if v_name is null then
    raise exception 'Tag not found' using errcode = 'P0002';
  end if;

  select count(*)::bigint into v_in_use_count
  from public.transactions tr
  where tr.user_id = v_uid
    and array_position(tr.tags, v_name) is not null;

  if v_in_use_count > 0 then
    return query select false as ok, v_in_use_count as in_use_count;
  end if;

  delete from public.tags where id = p_tag_id and user_id = v_uid;
  return query select true as ok, 0::bigint as in_use_count;
end;
$$;

GRANT
EXECUTE ON FUNCTION public.delete_tag_safe (UUID) TO authenticated;

-- ============================================================================
-- Source: supabase/schemas/015_transaction_tag_functions.sql
-- ============================================================================
-- 015_transaction_tag_functions.sql
-- Helper functions for transaction tags
-- Returns tags for a transaction as JSON array of objects {id, name, description}
CREATE
OR REPLACE FUNCTION public.get_transaction_tags (p_transaction_id UUID) RETURNS jsonb LANGUAGE SQL STABLE SECURITY DEFINER
SET
  search_path = '' AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'description', t.description
            ) ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::jsonb
    )
    FROM public.transaction_tags tt
    JOIN public.tags t ON tt.tag_id = t.id
    WHERE tt.transaction_id = p_transaction_id;
$$;

-- Replaces all tags for a transaction. Only the owning user may call this (auth.uid() check).
CREATE
OR REPLACE FUNCTION public.set_transaction_tags (p_transaction_id UUID, p_tag_ids UUID[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  -- Verify caller owns the transaction
  IF NOT EXISTS (
    SELECT 1 FROM public.transactions WHERE id = p_transaction_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Transaction not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Delete existing associations
  DELETE FROM public.transaction_tags WHERE transaction_id = p_transaction_id;

  -- Insert new associations when provided
  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    SELECT p_transaction_id, unnest(p_tag_ids)
    ON CONFLICT (transaction_id, tag_id) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_transaction_tags IS 'Returns tags for a transaction as JSON array';

COMMENT ON FUNCTION public.set_transaction_tags IS 'Replaces all tags for a transaction';

-- Grant execute to authenticated role will be set in migrations
GRANT
EXECUTE ON FUNCTION public.get_transaction_tags (UUID) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.set_transaction_tags (UUID, UUID[]) TO authenticated;

-- ============================================================================
-- Source: supabase/schemas/015_bulk_insert_transactions.sql
-- ============================================================================
-- 015_bulk_insert_transactions.sql
-- Atomically insert multiple transactions from a JSONB array.
-- Validates required fields, resolves category/bank_account names to IDs,
-- validates tags, and returns a JSON summary. Rolls back on any error.
CREATE
OR REPLACE FUNCTION public.bulk_insert_transactions (p_transactions jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_tx jsonb;
  v_category_id uuid;
  v_bank_account_id uuid;
  v_tx_id uuid;
  v_inserted_count integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_idx integer := 0;
  v_type public.transaction_type;
  v_tag text;
  v_tag_exists boolean;
BEGIN
  -- Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Ensure input is an array
  IF p_transactions IS NULL OR jsonb_typeof(p_transactions) <> 'array' THEN
    RAISE EXCEPTION 'p_transactions must be a JSON array' USING ERRCODE = '22023';
  END IF;

  -- Iterate through each element
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_idx := v_idx + 1;

    BEGIN
      -- Required fields
      -- Check for missing required fields and build specific error message
      DECLARE
        v_missing_fields text[] := ARRAY[]::text[];
        v_error_msg text;
      BEGIN
        IF v_tx->>'date' IS NULL THEN
          v_missing_fields := array_append(v_missing_fields, 'date');
        END IF;
        IF v_tx->>'type' IS NULL THEN
          v_missing_fields := array_append(v_missing_fields, 'type');
        END IF;
        IF v_tx->>'amount' IS NULL THEN
          v_missing_fields := array_append(v_missing_fields, 'amount');
        END IF;
        IF array_length(v_missing_fields, 1) IS NOT NULL THEN
          IF array_length(v_missing_fields, 1) = 1 THEN
            v_error_msg := format('Missing required field: %s', v_missing_fields[1]);
          ELSE
            v_error_msg := format('Missing required fields: %s', array_to_string(v_missing_fields, ', '));
          END IF;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx,
            'error', v_error_msg
          );
          CONTINUE;
        END IF;
      END;

      -- Type validation (casts to enum)
      BEGIN
        v_type := (v_tx->>'type')::public.transaction_type;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object(
          'index', v_idx,
          'error', format('Invalid transaction type: "%s"', v_tx->>'type')
        );
        CONTINUE;
      END;

      -- Resolve category name -> id if provided
      v_category_id := NULL;
      IF v_tx->>'category' IS NOT NULL THEN
        SELECT id INTO v_category_id
        FROM public.categories
        WHERE user_id = v_user_id
          AND type = v_type
          AND name = v_tx->>'category'
        LIMIT 1;

        IF v_category_id IS NULL THEN
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx,
            'error', format('Category "%s" not found for type "%s"', v_tx->>'category', v_type)
          );
          CONTINUE;
        END IF;
      END IF;

      -- Resolve bank account name -> id if provided
      v_bank_account_id := NULL;
      IF v_tx->>'bank_account' IS NOT NULL THEN
        SELECT id INTO v_bank_account_id
        FROM public.bank_accounts
        WHERE user_id = v_user_id
          AND name = v_tx->>'bank_account'
        LIMIT 1;

        IF v_bank_account_id IS NULL THEN
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx,
            'error', format('Bank account "%s" not found', v_tx->>'bank_account')
          );
          CONTINUE;
        END IF;
      END IF;

      -- Validate tags exist (if provided)
      IF v_tx->'tags' IS NOT NULL THEN
        FOR v_tag IN SELECT jsonb_array_elements_text(v_tx->'tags')
        LOOP
          SELECT EXISTS(
            SELECT 1 FROM public.tags WHERE user_id = v_user_id AND name = v_tag
          ) INTO v_tag_exists;

          IF NOT v_tag_exists THEN
            v_errors := v_errors || jsonb_build_object(
              'index', v_idx,
              'error', format('Tag "%s" not found', v_tag)
            );
            -- skip remaining tags and this transaction
            EXIT;
          END IF;
        END LOOP;

        -- If last error belongs to current index, skip insert
        IF jsonb_array_length(v_errors) > 0 AND (v_errors->-1->>'index')::integer = v_idx THEN
          CONTINUE;
        END IF;
      END IF;

      -- Insert transaction
      INSERT INTO public.transactions (
        user_id,
        date,
        type,
        category_id,
        bank_account_id,
        amount,
        tags,
        notes
      ) VALUES (
        v_user_id,
        (v_tx->>'date')::date,
        v_type,
        v_category_id,
        v_bank_account_id,
        (v_tx->>'amount')::numeric,
        CASE WHEN v_tx->'tags' IS NOT NULL THEN (SELECT array_agg(value::text) FROM jsonb_array_elements_text(v_tx->'tags')) ELSE NULL END,
        v_tx->>'notes'
      )
      RETURNING id INTO v_tx_id;

      v_inserted_count := v_inserted_count + 1;

      -- Insert tag associations into transaction_tags (map tag names -> tag ids)
      IF v_tx->'tags' IS NOT NULL THEN
        INSERT INTO public.transaction_tags (transaction_id, tag_id)
        SELECT DISTINCT
          v_tx_id,
          tg.id
        FROM jsonb_array_elements_text(v_tx->'tags') AS jt(tag_name)
        JOIN public.tags tg ON tg.user_id = v_user_id AND tg.name = jt.tag_name
        ON CONFLICT (transaction_id, tag_id) DO NOTHING;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'index', v_idx,
        'error', SQLERRM,
        'sqlstate', SQLSTATE
      );
      -- continue to next element
    END;

  END LOOP;

  -- If any errors collected, raise exception with details so client can parse
  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'Bulk insert failed with % error(s)', jsonb_array_length(v_errors)
      USING DETAIL = v_errors::text;
  END IF;

  -- success
  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count,
    'total_count', v_idx
  );
END;
$$;

-- Grant execute to authenticated role
GRANT
EXECUTE ON FUNCTION public.bulk_insert_transactions (jsonb) TO authenticated;

COMMENT ON FUNCTION public.bulk_insert_transactions IS 'Atomically insert multiple transactions from JSON. Validates foreign keys, rolls back on any error.';

-- ============================================================================
-- Source: supabase/schemas/016_bulk_upload_entities.sql
-- ============================================================================
-- 016_bulk_upload_entities.sql
-- Helper functions for bulk upload (entities)
-- Task 1.1: insert_categories
CREATE
OR REPLACE FUNCTION insert_categories (p_user_id UUID, p_categories jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_invalid_type text;
  v_inserted_count int := 0;
BEGIN
  -- Authorization: ensure the caller is authenticated and may act for p_user_id.
  -- Prefer explicit check rather than allowing arbitrary p_user_id values.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_categories: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_categories: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_categories IS NULL OR jsonb_array_length(p_categories) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required fields: every element must have name and type
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_categories) AS elem
  WHERE (elem->>'name') IS NULL OR (elem->>'type') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_categories: one or more items are missing required fields "name" or "type"';
  END IF;

  -- Validate that provided type values are members of transaction_type enum
  WITH types AS (
    SELECT DISTINCT (elem->>'type') AS typ
    FROM jsonb_array_elements(p_categories) AS elem
  ), invalid AS (
    SELECT typ
    FROM types
    WHERE typ NOT IN (
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = 'public.transaction_type'::regtype
    )
  )
  SELECT typ INTO v_invalid_type FROM invalid LIMIT 1;

  IF v_invalid_type IS NOT NULL THEN
    RAISE EXCEPTION 'insert_categories: invalid transaction_type: %', v_invalid_type;
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.categories (user_id, type, name, description)
  SELECT
    p_user_id,
    (elem->>'type')::public.transaction_type,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_categories) AS elem
  ON CONFLICT (user_id, type, name) DO NOTHING;
  
  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  -- Re-raise validation/user-raised errors so their original message and SQLSTATE
  -- are preserved (RAISE EXCEPTION produces SQLSTATE 'P0001').
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    -- Wrap unexpected errors to give a clear function-level context.
    RAISE EXCEPTION 'insert_categories failed: %', SQLERRM;
END;
$$;

-- Granting execute to authenticated role is handled in migration file
-- Task 1.2: insert_bank_accounts
CREATE
OR REPLACE FUNCTION insert_bank_accounts (p_user_id UUID, p_bank_accounts jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_inserted_count int := 0;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_bank_accounts: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_bank_accounts: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_bank_accounts IS NULL OR jsonb_array_length(p_bank_accounts) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required field: name must be present for every element
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_bank_accounts) AS elem
  WHERE (elem->>'name') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_bank_accounts: one or more items are missing required field "name"';
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.bank_accounts (user_id, name, description)
  SELECT
    p_user_id,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_bank_accounts) AS elem
  ON CONFLICT (user_id, name) DO NOTHING;
  
  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_bank_accounts failed: %', SQLERRM;
END;
$$;

-- Task 1.3: insert_tags
CREATE
OR REPLACE FUNCTION insert_tags (p_user_id UUID, p_tags jsonb) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_missing_count int;
  v_inserted_count int := 0;
BEGIN
  -- Authorization
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_tags: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.uid()::text <> p_user_id::text THEN
    RAISE EXCEPTION 'insert_tags: not authorized to insert for this user' USING ERRCODE = '42501';
  END IF;

  -- Nothing to do for NULL or empty input
  IF p_tags IS NULL OR jsonb_array_length(p_tags) = 0 THEN
    RETURN 0;
  END IF;

  -- Validate required field: name must be present for every element
  SELECT COUNT(*) INTO v_missing_count
  FROM jsonb_array_elements(p_tags) AS elem
  WHERE (elem->>'name') IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'insert_tags: one or more items are missing required field "name"';
  END IF;

  -- Batch insert using JSONB array elements. Use explicit p_user_id and
  -- ON CONFLICT DO NOTHING to avoid duplicates.
  INSERT INTO public.tags (user_id, name, description)
  SELECT
    p_user_id,
    elem->>'name',
    elem->>'description'
  FROM jsonb_array_elements(p_tags) AS elem
  ON CONFLICT (user_id, name) DO NOTHING;
  
  -- Get the number of rows actually inserted
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'insert_tags failed: %', SQLERRM;
END;
$$;

-- Task 1.4: bulk_upload_data
CREATE
OR REPLACE FUNCTION public.bulk_upload_data (p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_categories_inserted int := 0;
  v_bank_accounts_inserted int := 0;
  v_tags_inserted int := 0;
  v_transactions_inserted int := 0;
  v_tx_result jsonb;
BEGIN
  -- Authenticate caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'bulk_upload_data: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Categories (if provided)
  IF p_payload ? 'categories' AND p_payload->'categories' IS NOT NULL THEN
    v_categories_inserted := public.insert_categories(v_user_id, p_payload->'categories');
  END IF;

  -- Bank accounts (if provided)
  IF p_payload ? 'bank_accounts' AND p_payload->'bank_accounts' IS NOT NULL THEN
    v_bank_accounts_inserted := public.insert_bank_accounts(v_user_id, p_payload->'bank_accounts');
  END IF;

  -- Tags (if provided)
  IF p_payload ? 'tags' AND p_payload->'tags' IS NOT NULL THEN
    v_tags_inserted := public.insert_tags(v_user_id, p_payload->'tags');
  END IF;

  -- Transactions (if provided) - delegate to existing bulk_insert_transactions
  IF p_payload ? 'transactions' AND p_payload->'transactions' IS NOT NULL THEN
    -- bulk_insert_transactions is SECURITY DEFINER and will itself authenticate using auth.uid()
    v_tx_result := public.bulk_insert_transactions(p_payload->'transactions');
    -- Extract inserted_count if present
    IF v_tx_result IS NOT NULL AND v_tx_result ? 'inserted_count' THEN
      v_transactions_inserted := (v_tx_result->>'inserted_count')::int;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'categories_inserted', v_categories_inserted,
    'bank_accounts_inserted', v_bank_accounts_inserted,
    'tags_inserted', v_tags_inserted,
    'transactions_inserted', v_transactions_inserted
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    -- validation exceptions raised by helpers - preserve them
    RAISE;
  WHEN others THEN
    RAISE EXCEPTION 'bulk_upload_data failed: %', SQLERRM;
END;
$$;

-- ============================================================================
-- Source: supabase/schemas/017_reset_user_data.sql
-- ============================================================================
-- 017_reset_user_data.sql
-- Resets all user data: transactions, categories, tags, bank accounts
-- This is a destructive operation that permanently deletes all personal financial data
CREATE
OR REPLACE FUNCTION public.reset_user_data () RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_uid uuid;
  v_transactions_deleted bigint := 0;
  v_categories_deleted bigint := 0;
  v_tags_deleted bigint := 0;
  v_bank_accounts_deleted bigint := 0;
BEGIN
  -- Get authenticated user
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'reset_user_data: not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Delete in correct order to avoid FK constraint violations
  -- 1. Transactions first (has FKs to categories and bank_accounts)
  DELETE FROM public.transactions WHERE user_id = v_uid;
  GET DIAGNOSTICS v_transactions_deleted = ROW_COUNT;

  -- 2. Categories (no FKs after transactions deleted)
  DELETE FROM public.categories WHERE user_id = v_uid;
  GET DIAGNOSTICS v_categories_deleted = ROW_COUNT;

  -- 3. Tags (referenced in transactions.tags array, but transaction already deleted)
  DELETE FROM public.tags WHERE user_id = v_uid;
  GET DIAGNOSTICS v_tags_deleted = ROW_COUNT;

  -- 4. Bank accounts (no FKs after transactions deleted)
  DELETE FROM public.bank_accounts WHERE user_id = v_uid;
  GET DIAGNOSTICS v_bank_accounts_deleted = ROW_COUNT;

  -- Return summary of deleted records
  RETURN jsonb_build_object(
    'success', true,
    'transactions_deleted', v_transactions_deleted,
    'categories_deleted', v_categories_deleted,
    'tags_deleted', v_tags_deleted,
    'bank_accounts_deleted', v_bank_accounts_deleted
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT
EXECUTE ON FUNCTION public.reset_user_data () TO authenticated;

-- Document the function
COMMENT ON FUNCTION public.reset_user_data () IS 'Permanently deletes all personal financial data for the authenticated user, including:
- All transactions
- All categories
- All tags
- All bank accounts

This operation is atomic (all-or-nothing) and cannot be undone. Deletes in order:
transactions → categories → tags → bank_accounts to avoid FK constraint violations.

Returns JSON object with deletion counts:
{
  "success": boolean,
  "transactions_deleted": number,
  "categories_deleted": number,
  "tags_deleted": number,
  "bank_accounts_deleted": number
}';
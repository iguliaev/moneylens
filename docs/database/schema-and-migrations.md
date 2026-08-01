# Database Schema & Migrations

This project's database layer is PostgreSQL 17 via Supabase. All schema state lives under `supabase/`:

```
supabase/
├── migrations/       # Timestamped SQL migration files (the source of truth)
├── seeds/            # Sample data for development
├── templates/        # Email templates
├── tests/            # Database tests (pgTAP)
└── config.toml       # Supabase CLI configuration
```

## ⚠️ Migration-Only Rule — CRITICAL

Every schema change — table creation, column addition/removal/rename, index changes, RLS policy changes, function updates — **MUST go through a migration file.** Whether you create a new file or edit an existing one depends on whether the change has already reached `main`:

**When the feature has NOT yet been merged to `main`:**
You may edit the last migration file that belongs to your feature branch. This avoids unnecessary migration file proliferation and keeps the audit trail clean.

**When the change IS already on `main` (or you're unsure):**
**NEVER modify existing committed migration files.** Always create a new one:
1. `supabase migration new <descriptive_name>` — creates a new timestamped file
2. Write your SQL changes in that new file

Editing already-merged migrations breaks the audit trail and will corrupt any environment that has already applied them.

**Decision rule:** Before touching a migration file, run:
```bash
git log main..HEAD -- supabase/migrations/<file>
```
If the file appears in the output, it hasn't been merged — you can edit it. If it doesn't appear, create a new migration instead.

## Creating Migrations

1. Create migration: `supabase migration new my_feature`
2. Edit the generated SQL file in `supabase/migrations/`
3. Apply locally: `supabase migration up`
4. Test with: `supabase test db`
5. Update seeds if needed in `supabase/seeds/`

## Conventions

- **Table/Column Naming**: Use `snake_case`
- **Function Security**: Default to `SECURITY INVOKER` with explicit `search_path = ''`. Use `SECURITY DEFINER` only when a function genuinely needs to bypass RLS (multi-table writes, bulk operations, safe-delete helpers) — see below.
- **User Data Isolation**: Always scope queries to `auth.uid()`
- **RLS Policies**: Enable Row Level Security on all user-facing tables

### Views need `SECURITY INVOKER` too, not just functions

A `CREATE VIEW` with no explicit security option behaves like `SECURITY DEFINER` — it runs with the view owner's privileges and silently bypasses the querying user's RLS policies. This bit the schema once already: `20260225211531_fix_view_security_invoker.sql` had to drop and recreate 13 views (`transactions_with_details`, `categories_with_usage`, `view_monthly_totals`, etc.) to add the option. Any new view **must** be created with:
```sql
CREATE OR REPLACE VIEW public.my_view
WITH (security_invoker = TRUE) AS
SELECT ...
```

### Soft delete, not hard delete

User-facing tables (`transactions`, `categories`, `bank_accounts`, `tags`) have a `deleted_at TIMESTAMPTZ DEFAULT NULL` column (added in `20260227201422_add_soft_delete.sql`) instead of ever being hard-deleted. Deletion goes through dedicated RPCs — `delete_category_safe`, `delete_bank_account_safe`, `delete_tag_safe` — which check whether the row is still referenced (e.g. a category still used by transactions) and return `(ok boolean, in_use_count bigint)` rather than throwing, so the caller can decide what to do instead of it being an error. Any new view, RPC, or query that reads one of these tables **must** filter `deleted_at IS NULL`, or it will leak soft-deleted rows.

### Standard 4-policy RLS shape

Every user-facing table gets exactly four RLS policies, named `<table>_select` / `<table>_insert` / `<table>_update` / `<table>_delete`, each scoped with the identical predicate `user_id = (SELECT auth.uid())` (wrapped in a `SELECT` so Postgres can cache/inline it instead of re-evaluating `auth.uid()` per row — see `20260201164000_baseline_from_schemas.sql:190-236`). When adding a new user table, copy this exact template rather than writing a combined or ad-hoc policy.

### `set_user_id_on_*` + `set_updated_at_on_*` triggers are required boilerplate

Nearly every user table has a pair of `BEFORE INSERT`/`BEFORE UPDATE` triggers: `set_user_id_on_<table>` calls `tg_set_user_id()` to force `NEW.user_id = auth.uid()` server-side (defense-in-depth against a spoofed `user_id` in the insert payload), and `set_updated_at_on_<table>` calls `tg_set_updated_at()` to maintain `updated_at`. See `20260201164000_baseline_from_schemas.sql:241-249` for the canonical pair. New user tables should get both.

### Error-code (`ERRCODE`) vocabulary

`RAISE EXCEPTION` calls across the schema consistently reuse a small set of SQLSTATE codes rather than inventing new ones:

| Code | Meaning | Example use |
|------|---------|-------------|
| `28000` | Not authenticated (`auth.uid()` is null) | `delete_category_safe` |
| `42501` | Not authorized / ownership check failed (IDOR guard) | `set_transaction_tags`, most `SECURITY DEFINER` ownership checks |
| `P0002` | Row not found | `delete_category_safe` — category doesn't exist or isn't the caller's |
| `23514` | Check-constraint-style violation, typically from a trigger (e.g. cross-table reference belongs to a different user) | `check_transaction_bank_account` |
| `22023` | Invalid input shape/parameter | bulk-insert RPC payload validation |
| *(none)* | Plain validation message — defaults to `P0001` | e.g. category/type mismatch messages |

Reuse one of these instead of picking an arbitrary SQLSTATE when writing a new function.

### Category hierarchy is capped at 2 levels

`categories.parent_id` is self-referential, but it is **not** a general tree — `validate_category_parent()` (`20260601210000_add_category_hierarchy.sql:42-84`) enforces: no self-parenting, parent must belong to the same user and have the same `type`, a category that already has a parent can't itself be assigned as a parent (max depth 2), and a category with existing children can't be given a parent. Keep this constraint in mind before extending category nesting.

### ⚠️ `SECURITY DEFINER` functions — ownership checks are mandatory

RLS policies do **not** apply inside a `SECURITY DEFINER` function — the function runs with the privileges of its owner, not the calling user. If the function accepts an id for a row it doesn't already know the caller owns, and doesn't check that explicitly, it's an IDOR vulnerability: any authenticated user can pass another user's id and read or mutate their data. This has happened in this codebase (see `docs/superpowers/plans/2026-07-18-security-review-fixes.md` — `get_transaction_tags` had no ownership check at all; `check_transaction_category_type` checked category *type* but not category *ownership*).

The schema uses `SECURITY DEFINER` extensively (`bulk_insert_transactions`, `set_transaction_tags`, `delete_category_safe`/`delete_bank_account_safe`/`delete_tag_safe`, `bulk_upload_data`, `reset_user_data`, `insert_categories`/`insert_bank_accounts`/`insert_tags`, and others) — it's the right tool for multi-table writes and bulk operations that a plain RLS-scoped query can't do in one shot. Every one of them **must** independently verify ownership. Two idioms are used depending on whether the caller identity or an already-validated row is available:

**1. Function body checks `auth.uid()` directly** (functions called straight from the client, e.g. `set_transaction_tags`):
```sql
IF NOT EXISTS (
  SELECT 1 FROM public.transactions WHERE id = p_transaction_id AND user_id = auth.uid()
) THEN
  RAISE EXCEPTION 'Transaction not found or access denied' USING ERRCODE = '42501';
END IF;
```

**2. Trigger/helper checks the referenced row's `user_id` against `NEW.user_id`** (used when the check must also work inside another `SECURITY DEFINER` bulk-insert path where `auth.uid()` may not be the row owner being validated), e.g. `check_transaction_bank_account`:
```sql
if new.bank_account_id is not null then
  if not exists (
    select 1 from public.bank_accounts b
    where b.id = new.bank_account_id and b.user_id = new.user_id
  ) then
    raise exception 'Bank account does not belong to the user' using errcode = '23514';
  end if;
end if;
```

**Rule of thumb when writing or reviewing any `SECURITY DEFINER` function or trigger:** for every foreign id parameter (transaction id, category id, tag id, bank account id, etc.), add an explicit ownership `EXISTS`/join check before using it — never assume RLS is protecting the lookup.

## Key Tables

- `transactions`: Financial activity (earnings, spendings, savings)
- `categories`: User-defined transaction categories
- `bank_accounts`: User-defined bank accounts
- `tags`: User-defined tags for transactions

## Essential Commands

```bash
# Start local Supabase stack (PostgreSQL, Auth, Studio, etc.)
supabase start

# Stop Supabase services
supabase stop

# Open Supabase Studio (web UI for database management)
supabase studio
```

## Migration Workflow

```bash
# Create a new migration file
supabase migration new <descriptive_name>

# Apply pending migrations to local database
supabase migration up

# Reset database (drops all data and re-applies migrations + seeds)
supabase db reset

# View migration status
supabase migration list

# Generate diff between local and remote schema
supabase db diff
```

## Database Testing

```bash
# Run pgTAP database tests
supabase test db
```

Tests live in `supabase/tests/*.sql` (pgTAP). RLS/ownership tests follow a consistent multi-user convention: create two or more distinct test users with `tests.create_supabase_user('name@test.com')`, switch identity with `tests.authenticate_as('name@test.com')`, then assert one user can't see/modify another's rows. See `supabase/tests/bank_accounts_rls_test.sql` for the canonical pattern. Use this convention for any new RLS or ownership-check test rather than inventing a different setup.

## Type Generation

```bash
# Generate TypeScript types from database schema
supabase gen types typescript --local > types.gen.ts
```

Run this after any schema change so `types.gen.ts` at the repo root stays in sync.

## Remote Database Operations

```bash
# Link to remote Supabase project
supabase link --project-ref <project-ref>

# Push migrations to remote
supabase db push --linked

# Pull remote schema changes
supabase db pull
```

## Local Development Ports

| Service          | Port  |
|------------------|-------|
| API              | 54321 |
| Database         | 54322 |
| Supabase Studio  | 54323 |
| Inbucket (Email) | 54324 |
| Analytics        | 54327 |

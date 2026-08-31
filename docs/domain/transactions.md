# Transactions

A transaction is a single dated financial event belonging to one user: money earned, spent, or
saved. It's the record everything else in the app (categories, budgets, tags, bank accounts)
exists to organize.

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | Owner. Enforced by RLS + a `BEFORE INSERT` trigger. |
| `date` | date | No time component. |
| `type` | `transaction_type` (`earn` \| `spend` \| `save`) | See [overview.md](overview.md). |
| `amount` | numeric(12,2) | See "Amount has no sign convention" below. |
| `category_id` | uuid, nullable | References `categories`. See "Category must match type". |
| `bank_account_id` | uuid, nullable | References `bank_accounts`. |
| `notes` | text, nullable | |
| tags | many-to-many | Via the `transaction_tags` junction table, not a column. |
| `deleted_at` | timestamptz, nullable | Soft delete. |
| `created_at` / `updated_at` | timestamptz | |

Table: `public.transactions`. Two columns, `category` (text) and `bank_account` (text), still
exist on the table and are marked `-- Obsolete field, do not use` in the schema — they predate
`category_id`/`bank_account_id` and are not read or written by current code.

Read model for the UI: `public.transactions_with_details`, which resolves `category_name`,
`category_parent_name`, `category_type`, `bank_account_name`, `tag_ids`, and `tag_names` in one
row so the client doesn't have to join. Prefer reading from this view over the base table.

## Category must match type

If `category_id` is set, a `BEFORE INSERT OR UPDATE` trigger
(`check_transaction_category_type`) enforces two things: the category must belong to the same
`user_id` (`23514`, `"Category does not belong to the user"`), and the category's `type` must
equal the transaction's `type` (plain exception, `"Transaction type (%) does not match category
type (%)"`). There's no such thing as a `spend` transaction filed under an `earn` category.

`category_id` and `bank_account_id` are both nullable — a transaction can exist with neither, and
`bank_account_id` has its own trigger requiring it to belong to the same user if set
(`check_transaction_bank_account`, `23514`).

## Amount has no sign convention

`amount` is a plain `NUMERIC(12,2)` with no positivity check — the database currently accepts
zero or negative values. Direction is carried entirely by `type` (`earn`/`spend`/`save`), not by
the sign of `amount`. Don't assume `spend` rows are stored negative.

## Writing transactions

The client does not insert into `transactions` and `transaction_tags` separately. Two atomic
`SECURITY DEFINER` RPCs handle both in one DB transaction
(`supabase/migrations/20260510120000_atomic_transaction_with_tags.sql`):

- `create_transaction_with_tags(p_transaction jsonb, p_tag_ids uuid[])`
- `update_transaction_with_tags(p_transaction_id uuid, p_transaction jsonb, p_tag_ids uuid[])`

Both validate that `category_id`, `bank_account_id` (if provided), and every id in `p_tag_ids`
belong to the caller and are **live** (`deleted_at IS NULL`) before writing, raising `42501`
("... not found or access denied") otherwise. `p_tag_ids` is replace-all semantics: the update
RPC deletes all existing `transaction_tags` rows for the transaction and re-inserts the given set,
so passing a partial list drops the tags you omit.

Bulk import (CSV/JSON upload) goes through a different RPC, `bulk_upload_data` →
`bulk_insert_transactions`, which resolves `category`/`bank_account`/`tags` by **name** rather
than id, and only accepts leaf categories (no children) for bare-name resolution. See
[`docs/api/bulk-upload.md`](../api/bulk-upload.md) for the full payload schema, the
`"Parent/Child"` category path convention, and every validation error message.

## Soft delete

Transactions are soft-deleted (`deleted_at`), via a blind `UPDATE ... SET deleted_at = NOW()`
issued by the generic data-provider wrapper (`apps/web-next/src/utility/softDeleteDataProvider.ts`)
— there's no in-use check to worry about here since nothing else references a transaction by FK.
Any new read (view, RPC, or query) must filter `deleted_at IS NULL` explicitly; see
[`docs/database/schema-and-migrations.md`](../database/schema-and-migrations.md#soft-delete-not-hard-delete).

## Related

- [Categories](categories.md) — the type-match rule, hierarchy, and what happens if a
  transaction's category gets soft-deleted out from under it.
- [Tags](tags.md) — the many-to-many relationship and its own liveness rules.
- [Budgets](budgets.md) — how a transaction's category/tags feed into budget progress.
- [`docs/api/bulk-upload.md`](../api/bulk-upload.md) — bulk import contract.

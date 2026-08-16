# Categories

A category is a per-user label used to classify transactions — e.g. "Groceries", "Salary",
"Emergency Fund". Every category belongs to exactly one `type` and, optionally, one parent
category (max 2 levels deep).

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | Owner. Enforced by RLS + a `BEFORE INSERT` trigger that forces it to `auth.uid()`. |
| `type` | `transaction_type` (`earn` \| `spend` \| `save`) | Shared enum with `transactions` and `budgets`. See [overview.md](overview.md). |
| `name` | text | Max 255 chars in the bulk-upload path (see below). |
| `description` | text | Optional. |
| `parent_id` | uuid, nullable | References another category. `NULL` = root category. |
| `deleted_at` | timestamptz, nullable | Soft delete — see below. |
| `created_at` / `updated_at` | timestamptz | |

Table: `public.categories`. Read model for the UI: `public.categories_with_usage` (adds
`parent_name`, `sort_label`, `child_count`, `in_use_count` — see below).

## Type is load-bearing

A category's `type` isn't just a filter — [`transactions.md`](transactions.md) enforces that a
transaction's `type` must equal its category's `type` (`check_transaction_category_type`
trigger). Budgets carry the same constraint against the categories/tags they link. There is no
cross-type category: "Groceries" for `spend` and a same-named "Groceries" for `earn` are two
distinct rows.

## Hierarchy: exactly 2 levels, no more

`parent_id` is self-referential, but it is **not** a general tree. The `validate_category_parent`
trigger (`supabase/migrations/20260601210000_add_category_hierarchy.sql`) enforces, on every
insert/update:

- No self-parenting.
- The parent must belong to the same user and have the same `type`.
- The parent must itself be a root category (`parent_id IS NULL`) — a child cannot have children.
- A category that already has children cannot be given a parent.

A `category_hierarchy` closure table (`ancestor_id`, `descendant_id`, `depth` ∈ {0, 1}) is kept in
sync automatically by an `AFTER` trigger (`sync_category_hierarchy`) — never write to it directly.

## Naming and uniqueness

- Uniqueness is `(user_id, type, name, parent_id)` with `NULLS NOT DISTINCT`, so two *root*
  categories can't share a name, but the same name can exist under different parents — e.g.
  `Food/Groceries` and `Vacations/Groceries` can coexist
  (`20260627124710_fix_category_unique_constraint_include_parent_id.sql`).
- A category's own `name` is always a bare leaf name (never a `"Parent/Child"` string) — that
  path syntax is a separate convention used only when a *transaction* or CSV/JSON row needs to
  unambiguously reference a nested category. See
  [`docs/api/bulk-upload.md`](../api/bulk-upload.md#category-input-schema) for the full
  resolution rules: a bare name only resolves against **root-level leaf** categories (no parent,
  no children); a category with a parent must be addressed as `"Parent/Child"`.

## Soft delete

Categories are soft-deleted (`deleted_at`), never hard-deleted from user-facing flows. There are
two different delete paths in this codebase, and they currently diverge:

- `delete_category_safe(p_category_id)` is a `SECURITY DEFINER` RPC that counts **live**
  transactions referencing the category and refuses to delete (returns `ok = false,
  in_use_count = N`) if any exist. It does not check for live *child* categories.
- The web UI's actual delete action does **not** call this RPC. `deleteOne`/`deleteMany` for
  `categories` go through the generic soft-delete wrapper
  (`apps/web-next/src/utility/softDeleteDataProvider.ts`), which unconditionally sets
  `deleted_at = NOW()` regardless of usage. The categories list page displays `in_use_count`
  (from `categories_with_usage`) for information, but nothing in the UI blocks the delete on it.

Practical consequence: a category can be soft-deleted while still referenced by existing
transactions (`transactions.category_id`) or by a child category's `parent_id`. Existing rows
keep displaying it (reads don't filter on the category's own `deleted_at` everywhere — e.g.
`transactions_with_details` joins `categories` without a liveness filter), but
`create_transaction_with_tags`/`update_transaction_with_tags` and `create_budget_with_links`/
`update_budget_with_links` all require a **live** category, so re-saving an existing transaction
or budget that references a deleted category will fail with `"Category not found or access
denied"` until a different category is chosen.

## Related

- [Transactions](transactions.md) — the category a transaction is filed under, and the type-match
  rule.
- [Budgets](budgets.md) — budgets track progress by linking to a set of categories.
- [`docs/api/bulk-upload.md`](../api/bulk-upload.md) — the `CategoryInput` schema, auto-creation
  of parent categories on import, and every validation error message.
- [`docs/database/schema-and-migrations.md`](../database/schema-and-migrations.md) — soft-delete
  and RLS conventions that apply to this table (and every other user table).

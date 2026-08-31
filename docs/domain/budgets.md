# Budgets

A budget is a user-defined target for one `type` (`earn`, `spend`, or `save`) over an optional
date range, tracked automatically by matching it against the user's transactions — there's no
manual "log against a budget" step.

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | Owner. |
| `name` | text | |
| `description` | text, nullable | |
| `type` | `transaction_type` (`earn` \| `spend` \| `save`) | See [overview.md](overview.md). |
| `target_amount` | numeric(12,2) | `CHECK (target_amount > 0)`. |
| `start_date` / `end_date` | date, nullable | `NULL` = open-ended on that side. `CHECK (start_date <= end_date)` when both are set. |
| `deleted_at` | timestamptz, nullable | Soft delete. |
| `created_at` / `updated_at` | timestamptz | |

Table: `public.budgets`. Read model for the UI: `public.budgets_with_linked`, which adds
`category_count`, `tag_count`, and `current_amount` (live progress — see below).

## Linking: categories and/or tags

A budget tracks transactions through two independent many-to-many links:

- `budget_categories` (budget ↔ category)
- `budget_tags` (budget ↔ tag)

A budget can use either, both, or neither (a budget with no links matches nothing and stays at
`current_amount = 0`). Both linked categories and linked tags must be the same user's and
**live** (`deleted_at IS NULL`) at write time — enforced the same way as on transactions, in
`create_budget_with_links`/`update_budget_with_links`
(`supabase/migrations/20260725120000_atomic_budget_with_links.sql`), replace-all semantics for
both arrays. There's no per-budget uniqueness constraint stopping two budgets from linking the
same category or overlapping date ranges.

## How `current_amount` is computed

`budgets_with_linked` (`20260426172323_add_current_amount_to_budgets_with_linked.sql`) sums a
transaction into a budget's `current_amount` if **all** of:

- `transaction.type = budget.type`
- `transaction.user_id = budget.user_id`, transaction is not soft-deleted
- `transaction.date` falls within `[start_date, end_date]` (open-ended sides are unbounded)
- **and** either: `transaction.category_id` is one of the budget's linked categories, **or** the
  transaction has one of the budget's linked tags (via `transaction_tags`)

The two match paths (`UNION`, not `UNION ALL`) are deduplicated — a transaction that matches
through both a linked category and a linked tag is still counted exactly once. A soft-deleted
linked category or tag simply stops contributing (the view joins with `deleted_at IS NULL` on
`categories`/`tags`); the stale row in `budget_categories`/`budget_tags` itself is not cleaned up
automatically.

## Soft delete

Like transactions, budgets are soft-deleted via a blind `UPDATE ... SET deleted_at = NOW()`
from the generic data-provider wrapper (`apps/web-next/src/utility/softDeleteDataProvider.ts`) —
there's no `delete_budget_safe` RPC, since nothing references a budget by foreign key (deleting
one only orphans its own `budget_categories`/`budget_tags` rows, which the read views already
filter around via the `WHERE b.deleted_at IS NULL` on `budgets`).

## Related

- [Categories](categories.md) / [Tags](tags.md) — what a budget can link to, and their own
  liveness rules.
- [Transactions](transactions.md) — the rows a budget's `current_amount` is computed from.

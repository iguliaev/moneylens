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

A budget can use either, both (combined with AND, see below), or neither (a budget with no links
matches nothing and stays at `current_amount = 0`). Both linked categories and linked tags must
be the same user's and **live** (`deleted_at IS NULL`) at write time — enforced the same way as on transactions, in
`create_budget_with_links`/`update_budget_with_links`
(`supabase/migrations/20260725120000_atomic_budget_with_links.sql`), replace-all semantics for
both arrays. There's no per-budget uniqueness constraint stopping two budgets from linking the
same category or overlapping date ranges.

## How `current_amount` is computed

`budgets_with_linked` (most recently redefined in
`20261025172439_budget_and_matching_categories_tags.sql`) sums a transaction into a budget's
`current_amount` if **all** of:

- the budget has at least one live linked category or tag (see below)
- `transaction.type = budget.type`
- `transaction.user_id = budget.user_id`, transaction is not soft-deleted
- `transaction.date` falls within `[start_date, end_date]` (open-ended sides are unbounded)
- **categories:** the budget has no live linked categories, **or** the transaction's category is
  one of them or a descendant of one (`category_hierarchy`, so a parent-linked budget matches its
  children's transactions)
- **and tags:** the budget has no live linked tags, **or** the transaction has at least one of
  them (via `transaction_tags`)

So the two sets are combined with **AND**, and each set is an OR inside — the same rule as the
category and tag filters on the transactions page. An empty set is "no constraint": a budget linked
only to categories, or only to tags, matches exactly what that one set selects. Linking both
narrows the match, e.g. `Vacation` plus a trip tag counts only that trip's vacation spending.
Every transaction is evaluated once against this single predicate, so it can never be counted twice.

"Live" means the linked category or tag is not soft-deleted. A soft-deleted link simply stops
counting as a link; the stale row in `budget_categories`/`budget_tags` itself is not cleaned up
automatically. A budget with **no live links at all** — never linked, or every linked category and
tag soft-deleted — matches nothing (`current_amount = 0`) rather than every transaction of its
type.

Liveness is judged per set. A budget linked to a category and a tag whose tag is later
soft-deleted therefore has an empty tag set, which is "no constraint", so it falls back to
matching by category alone.

`get_budget_progress()` is a thin wrapper over `budgets_with_linked`, so the match rule is defined
in exactly one place.

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

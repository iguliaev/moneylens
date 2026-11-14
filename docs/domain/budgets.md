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
| `active` | boolean, `NOT NULL DEFAULT true` | Whether the budget is shown on the dashboard. Display only — an inactive budget still computes `current_amount`. See [Active flag](#active-flag). |
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

## Active flag

`budgets.active` is the only thing that decides whether a budget appears on the dashboard. It is
independent of the budget's dates and of the year selected on the dashboard, so a budget with no
dates, or one dated entirely in a past year, shows exactly when it is active.

- New budgets are active by default (column default, `create_budget_with_links`, and
  `insert_budgets`/bulk upload when the field is omitted or `null`).
- The Budgets list page shows every budget, active or not, with an "On dashboard" switch so a budget
  can be hidden or brought back without opening the edit form. The create and edit forms have the
  same switch ("Show on dashboard").
- The dashboard lists active budgets ordered by name (case-insensitive), not by creation time.
- Inactive budgets keep tracking: `current_amount` is computed the same way, so reactivating one
  loses nothing.
- `update_budget_with_links` leaves the flag unchanged when its payload omits `active`.
- JSON export writes `"active": false` for inactive budgets only; a missing field imports as
  active.
- A "Completed" tag (`end_date` before today) is shown next to a budget on the list, show page and
  dashboard. It is display-only and has no effect on matching or visibility.

## View transactions

Each budget has a "View transactions" link (budgets list, budget show page, dashboard card) that
opens the Transactions page filtered to the rows behind `current_amount`. The filters are the
budget's definition expressed as the list's URL filters (`syncWithLocation`):

| Budget field | URL filter |
|---|---|
| `type` | `type eq <type>` |
| `start_date` / `end_date` | `date between` when both are set, `date gte` / `date lte` when only one is |
| linked categories | `category_id in [...]`, each linked parent expanded to itself and all its descendants |
| linked tags | the `tag_ids_or` conditional filter |

Links to soft-deleted categories or tags are left out, and a budget with no live links has the
link disabled (it matches nothing). The URL is built by `utility/transactionFilterUrl.ts`; the
SQL sum and the URL are two encodings of the same rule, so the e2e test "rows behind the link sum
to the budget's current amount" in `budgets.spec.ts` guards against drift.

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

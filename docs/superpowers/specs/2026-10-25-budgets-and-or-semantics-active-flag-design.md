# Budgets: AND Matching, Active Flag, and Transaction Link Design

**Status:** Draft

## Context

A budget is intended to be a light abstraction: a target number plus an accumulation over a filter
(categories, tags, or both, optionally within a date window). Using it with real data (trip and
holiday budgets) exposed four problems:

1. **Categories and tags are ORed.** A transaction counts if its category is linked **or** it has a
   linked tag. Linking Vacation and a trip tag therefore sums all vacation spending, not the trip.
   The transactions page filters behave differently: categories are ORed among themselves, tags are
   ORed among themselves, and the two sets are ANDed.
2. **Dashboard clutter.** Every budget is listed on the dashboard, newest first, regardless of its
   dates or the year selected there.
3. **No way to see what a budget is made of.** The progress bar shows a sum, but there is no path
   from a budget to the transactions behind it.
4. **Dates do double duty.** `start_date`/`end_date` only filter which transactions are summed.
   For tag-based budgets (trips booked a year ahead, holiday budgets spanning several trip tags)
   the transaction dates are not the budget's lifespan, so dates cannot also decide visibility.

Budgets are not used in production yet, so no data migration or backward-compatibility handling is
required.

## Goals

1. Match with AND between the linked category set and the linked tag set, the same as the
   transactions page filters.
2. Add an `active` flag on budgets that alone decides whether a budget appears on the dashboard.
3. Add a "View transactions" link from a budget to the transactions page, carrying the same filter
   as the budget's definition.
4. Keep budgets light: no new tables, no new columns on `transactions` or its views.

## Non-goals

1. No budget hierarchy, parent/child budgets, or allocation between budgets.
2. No per-budget match-mode setting; AND is the only mode.
3. No visibility rule based on the dashboard year, budget dates, or pinning.
4. No filtered-transaction total on the transactions page.
5. No recurring or monthly-reset budgets.

## Matching semantics

A transaction counts toward a budget when all of the following hold:

- `transaction.type = budget.type`, same user, not soft-deleted.
- `transaction.date` lies within `[start_date, end_date]`; a missing side is unbounded.
- **Categories:** the budget has no live linked categories, or the transaction's category is one of
  them or a descendant of one (via `category_hierarchy`, as today).
- **Tags:** the budget has no live linked tags, or the transaction has at least one of them.

An empty set is no constraint, as in the transactions page filters. As a consequence:

- Budgets linked to categories only, or to tags only, match exactly the transactions they match
  today.
- Budgets linked to both now match only transactions satisfying both sets.
- **A budget with no live links matches nothing** (`current_amount = 0`), as today. Without this
  special case it would match every transaction of its type. The UI shows such a budget as
  incomplete.
- "Live" means linked rows whose category or tag is not soft-deleted. A budget whose only linked
  tag was soft-deleted therefore has no live links and matches nothing; it does not widen to
  everything.

Typical shapes after this change:

| Use | Links | Dates |
|---|---|---|
| Trip budget | one tag (`France 2026`) | none, or a loose window |
| Holiday budget | several trip tags (`France 2025`, `Morocco 2025`, ...) | none, or an end date generous enough not to cut off late transactions |
| Narrow trip spend | `Vacation` category and a trip tag | as needed |
| Monthly groceries | `Groceries` category | one month |

The `UNION` of the two match paths and its de-duplication disappear: a transaction now either
satisfies the combined predicate or it does not, so it is counted once by construction.

## Active flag

- New column `budgets.active boolean NOT NULL DEFAULT true`.
- The dashboard `BudgetsSection` lists only active budgets. Dates, completion, and the selected
  dashboard year do not affect visibility.
- The budgets list page shows all budgets, active and inactive, with an on/off switch in a column
  so a budget can be hidden or reactivated without opening the edit form. The create/edit forms
  also expose the flag.
- Inactive budgets keep computing `current_amount`; the flag only controls the dashboard.
- An optional, display-only "Completed" tag appears when `end_date < today`. It does not change
  visibility or matching.
- The dashboard orders active budgets by name, not by creation time.
- The dashboard's empty state wording distinguishes "no budgets yet" from "no active budgets" and
  points to the budgets page in both cases.

## Link to transactions

A "View transactions" action opens the transactions page filtered to the budget's definition. It
is available from the budgets list, the budget show page, and each dashboard budget card, and is
disabled for a budget with no live links.

The filter is the budget's definition expressed in the transactions page's URL filters (the list
uses `syncWithLocation`):

| Budget field | URL filter |
|---|---|
| `type` | `type eq <type>` |
| `start_date` / `end_date` | `date between [start, end]` when both are set; `date gte` / `date lte` when only one is |
| live linked categories | `category_id in [ids]`, each linked parent expanded to the parent and all its descendants |
| live linked tags | the existing `tag_ids_or` conditional filter |

Top-level filters combine with AND, which is exactly the matching rule. The shapes were checked
against the running app: nested `or` and `in` filters survive a cold load from the URL and combine
with AND (for example, Vacation-group categories AND two trip tags returned 34 rows against 35 for
the tags alone, the difference being a trip-tagged transaction filed under another category).

The URL is built by a shared helper, `utility/transactionFilterUrl.ts`, the same one used by the
Breakdown tab's drill-down (see the Breakdown tab design). Category descendants come from
`category_hierarchy`. Links that point at soft-deleted categories or tags are left out, mirroring
the SQL.

Both the sum (SQL) and the link (TypeScript) encode the same rule, so they can drift. The Testing
section below guards against that.

## Data layer

One new migration, with no changes to existing migrations:

1. `ALTER TABLE public.budgets ADD COLUMN active boolean NOT NULL DEFAULT true`.
2. Re-assert in full (`CREATE OR REPLACE`, per repo convention) `budgets_with_linked`, so
   `b.*` includes `active` and the match follows the new rule.
3. Re-assert `get_budget_progress()` with the same match rule and an `active` column in its result.
   If it no longer has callers, keep it consistent regardless, so the two definitions never
   diverge.
4. Re-assert `create_budget_with_links` and `update_budget_with_links` so the `p_budget` JSON
   accepts `active` (missing means `true` on create, unchanged on update).

The match is a single query. In outline, per budget: transactions of the budget's type, user and
date window, filtered by the category predicate and the tag predicate, where each predicate is
`NOT EXISTS (live links of that kind) OR EXISTS (matching live link)`, and the whole budget is
excluded when it has neither live category links nor live tag links.

Everything that serializes budget columns needs the new field: the JSON export and restore
(`exportMetadata.ts`, `jsonExport`), `bulk_upload_data`, `reset_user_data` seeds, generated types
(`types.gen.ts`, `database.types.ts`), and the seed/insert-budgets migrations used by DEV and
staging if they list columns explicitly.

## Frontend

- `pages/dashboard/useBudgets.ts`: filter `active = true`, sort by `name` ascending instead of
  `created_at` descending, and carry the field in `BudgetProgress`.
- `pages/budgets/list.tsx`: add the active switch column and the View transactions action.
- `pages/budgets/create.tsx`, `edit.tsx`, `hooks/useBudgetForm.ts`: add the flag.
- `pages/budgets/show.tsx` and `pages/dashboard/BudgetsSection.tsx`: add the View transactions
  action and the optional Completed tag.
- Budget form wording: the category and tag selectors read "any of these categories" and "any of
  these tags", with a note that the two sets are combined with AND, so users are not surprised by
  the new meaning.
- Update `docs/domain/budgets.md` for the new matching rule, the `active` flag, and the link.

## Testing

- `supabase/tests/budget_progress_test.sql`: rewrite the OR expectations. Cover category only, tag
  only, both (AND), neither (zero), parent category matching children, a soft-deleted linked
  category or tag (a budget that loses its only link matches nothing), date bounds including
  open-ended sides, the type match, and a transaction counted once.
- `atomic_budget_with_links_test.sql`: `active` default and update behavior.
- `bulk_upload_budgets_test.sql`, `reset_user_data_test.sql`: `active` round-trips or resets.
- Playwright (`e2e/tests/budgets.spec.ts` and a dashboard test): inactive budgets are absent from
  the dashboard and present on the list; toggling the switch changes dashboard visibility.
- **Parity test:** for a seeded budget with a parent category, a tag, and an end date, open
  "View transactions" and assert the filtered rows sum to the budget's `current_amount`. This is
  the safeguard against drift between the SQL rule and the URL builder.
- Unit tests for the URL builder: parent expansion, dead-link omission, open-ended dates, no-links
  case.

## Decisions

1. The dashboard lists active budgets sorted by name (ascending, case-insensitive), not by
   creation time.
2. `active` defaults to `true`, in the database and in the create form.
3. The date range stays optional and unchanged. Quick-pick end dates and an "N matching
   transactions after the end date are excluded" hint are out of scope for this change.

# Dashboard Breakdown Tab Design

**Status:** Draft

## Context

The dashboard answers "how is spending trending" (Charts tab) and "what happened in this
month/year" (Yearly/Monthly tabs, including a category breakdown). It does not answer "how much
went through a given bank account, tag, or category over an arbitrary period". The Charts tab's
by-tag section is a trend over months, and nothing at all exists for bank accounts.

The existing chart data comes from month-granular views (`view_monthly_totals`,
`view_monthly_category_totals`, `view_monthly_tagged_type_totals`), so they cannot serve a period
with arbitrary start and end dates.

## Goals

1. Add a **Breakdown** dashboard tab, placed between "Monthly Statistics" and "Charts".
2. For one chosen dimension — category, tag, or bank account — show a ranked list of entities with
   the total amount and the number of transactions over a user-chosen period.
3. Let the user follow one entity: selecting a row shows that entity's total per calendar month
   across the period.
4. Let the user drill down from a row to the matching transactions on the transactions page.

## Non-goals

1. No share/percentage column and no grand total.
2. No comparison across dimension classes (a tag against a category, etc.).
3. No changes to the budget feature; budget work is specified separately.
4. No changes to the existing tabs or the month-granular views.

## Controls

| Control | Values | Notes |
|---|---|---|
| Dimension | Category, Tag, Bank account | Segmented control. Switching it resets the selected row. |
| Type | Spend, Earn, Save | Segmented control, same labels and colours as the transactions page. Default Spend. |
| Period | Start date and end date, inclusive | Own `RangePicker`, independent of the dashboard's year/month selection. Default: 1 January of the current year to today. Displayed as `DD/MM/YYYY`, serialized as `YYYY-MM-DD` (see the date-locale design). |
| Group by parent | On/off | Visible only for the Category dimension. Off = leaf categories; on = leaf categories rolled up into their parent. Top-level categories without children appear as themselves. |

An empty or inverted period shows an inline validation message and does not query.

## Ranked list

A table, sorted by total descending (ties broken by name), with these columns:

| Column | Content |
|---|---|
| Entity | Name. For leaf categories shown as `Parent / Child`, matching the transactions page. |
| Total | Sum of `amount` for matching transactions, formatted with the user's currency. A horizontal bar behind or beside the value, scaled to the largest row (visual only, no percentage shown). |
| Transactions | Count of matching transactions. |

Behaviour:

- Soft-deleted transactions are excluded. Transactions of the chosen type with a date inside the
  period are included.
- **Tags:** a transaction with several tags counts toward each of them, so the rows do not add up
  to a total. When the dimension is Tag, an info line states this.
- Rows with a zero total do not appear (an entity appears only if it has at least one matching
  transaction).
- Loading state: skeleton, as on other dashboard tabs. Error state: an `Alert` with the message,
  as in `BudgetsSection`. Empty state: a short "No <type> transactions in this period" message.

## Selected entity: monthly view

Clicking a row selects it and renders a bar chart below the table: one bar per calendar month from
the month of the start date to the month of the end date. Months with no matching transactions are
shown with a zero bar (zero-filled on the client with `getMonthKeysInRange`). The first and last
months include only the days inside the period, and a note says so when the period does not cover
whole months. Clicking the selected row again, or changing the dimension, type, period or grouping,
clears the selection.

## Drill-down

Each row has a link to the transactions page with these filters in the URL (the transactions list
uses `syncWithLocation`, so the URL is the state):

- `type eq <type>`
- `date between [start, end]`
- Category: `category_id in [ids]`. In leaf mode this is the single category id; in parent mode it
  is the parent's id plus its children's ids.
- Tag: the existing `tag_ids_or` conditional filter with a single tag.
- Bank account: `bank_account_id in [id]`.

These shapes were checked against the running app: nested `or` filters and `in` filters survive a
cold load from the URL and combine with AND. The URL building lives in one shared helper so the
planned budget-to-transactions link can reuse it.

## Data layer

Two read-only RPCs, `SECURITY INVOKER`, `SET search_path = ''`, filtering by `auth.uid()` and
`deleted_at IS NULL`, following `get_budget_progress`. Both are added by a new migration.

### `get_breakdown`

```
get_breakdown(
  p_dimension       text,              -- 'category' | 'tag' | 'bank_account'
  p_type            transaction_type,
  p_start           date,
  p_end             date,
  p_group_by_parent boolean default false
) RETURNS TABLE (
  entity_id   uuid,
  entity_name text,
  parent_name text,    -- leaf categories only, else null
  total       numeric,
  tx_count    bigint
)
```

- `category`: groups on `transactions.category_id`; with `p_group_by_parent` it groups on the
  category's parent (via `category_hierarchy`), or on the category itself when it has none.
- `tag`: joins through `transaction_tags`; one row per tag.
- `bank_account`: groups on `transactions.bank_account_id`.
- Rejects an unknown `p_dimension` with an error.

### `get_breakdown_monthly`

```
get_breakdown_monthly(
  p_dimension       text,
  p_entity_id       uuid,
  p_type            transaction_type,
  p_start           date,
  p_end             date,
  p_group_by_parent boolean default false
) RETURNS TABLE (month date, total numeric, tx_count bigint)
```

Returns one row per calendar month that has at least one matching transaction. The matching rules
are identical to `get_breakdown`, applied to a single entity (in parent mode, the entity is the
parent and includes its children).

The two functions share the same matching logic, so it is written once, in a helper, and not
duplicated.

## Frontend

- `pages/dashboard/index.tsx`: add the `breakdown` tab between `monthly` and `charts`.
- `pages/dashboard/BreakdownTab.tsx`: controls, ranked list, selected-entity chart.
- `hooks/useBreakdown.ts`: calls the two RPCs through the existing Refine data provider pattern and
  maps rows to typed results, with the error handling used in `useChartsData`.
- `utility/transactionFilterUrl.ts`: the shared URL builder described under Drill-down.

## Testing

- pgTAP tests in `supabase/tests/` for both RPCs: each dimension, type filter, inclusive date
  bounds, soft-deleted transactions excluded, multi-tag transactions counted per tag, parent
  grouping (including a childless top-level category), another user's data not visible, unknown
  dimension rejected.
- Playwright e2e: the tab renders in the right position, switching dimensions changes the rows, an
  inverted period shows the validation message, a row link opens the transactions page with the
  expected rows.
- Unit tests for the URL builder and for the zero-filled month series.

## Open questions

1. **Untagged transactions** under the Tag dimension: omit them, or show an "Untagged" row? The
   default here is to omit them.
2. **Soft-deleted entities:** transactions that still point at a deleted category, tag or bank
   account. Default here: they still count, and the entity is shown with its stored name.
3. **Nullability:** whether `bank_account_id` can be null on a transaction. If it can, the Bank
   account dimension needs a "No account" row or an explicit omission. To be verified against the
   schema before the implementation plan.

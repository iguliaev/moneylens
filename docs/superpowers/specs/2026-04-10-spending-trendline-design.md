# Spending Trendline Chart — Design Spec

**Date:** 2026-04-10  
**Status:** Approved, implemented, and amended after PR review

---

## Problem

The original plan for the Charts tab included three category donut charts (one per transaction type). Donuts show totals over the selected period but give no sense of how spending has changed over time. Users want to track whether a category or tag is growing, shrinking, or spiking.

## Solution

Replace the category-donut concept with a multi-line trendline chart scoped to **Spending only**. Each line represents one selected category or tag, plotted month-by-month over the selected date range.

The final implementation also preserves the full selected month range in both dashboard charts, so months with zero transactions still render as zero-value points/bars instead of disappearing from the timeline.

---

## Location

Inside `apps/web-next/src/pages/dashboard/ChartsTab.tsx`.  
The category-donut plan is replaced by a new `SpendingTrendlineChart` component, and the final shipped version is covered by `apps/web-next/e2e/tests/dashboard.spec.ts`.

---

## Component: `SpendingTrendlineChart`

### Controls

| Control | Component | Behaviour |
|---------|-----------|-----------|
| Category / Tag toggle | Ant Design `Segmented` | Switches the item pool between categories and tags. Resets selection to new top 5. |
| Item selector | Ant Design `Select mode="multiple"` | Lists all categories (or tags) that have spending data in the current date range. Pre-selects top 5 by total spend. |

### Chart

- **Library:** Recharts `LineChart`  
- **X axis:** Month labels (e.g. "Jan 25") — one tick per month in range  
- **Y axis:** Currency-formatted spend amount  
- **Lines:** One `Line` per selected item, each with a distinct colour from `CHART_COLORS`  
- **Tooltip:** Shows month + each selected item's spend formatted with `CurrencyTooltipFormatter`  
- **Legend:** Top, 12px font  
- **Points:** `dot={false}`, `activeDot={{ r: 4 }}` — clean lines, dots only on hover  
- **Tension:** `type="monotone"` for smooth curves
- **Series keys:** Use safe internal keys (`k0`, `k1`, ...) instead of raw category/tag names so Recharts does not treat names containing dots or brackets as nested data paths
- **Missing months:** Generate the full month sequence from the selected date range and fill missing values with zeroes before rendering

### Default selection

When the chart mounts or the date range changes, compute the top 5 items by total spend in that period from the already-fetched spending-by-month arrays and set them as the initial selection.

### Empty state

When no data exists for the selected items/period, render: _"No spending data for the selected {categories|tags} in this period."_

---

## Data

No new fetches are required. `useChartsData` fetches:

- `view_monthly_totals` → provides `{ month, type, total }` rows for the aggregate bar chart  
- `view_monthly_category_totals` → provides `{ month, category, type, total }` rows  
- `view_monthly_tagged_type_totals` → provides `{ month, tags[], type, total }` rows (tags are exploded client-side into per-tag totals)

Final hook responsibilities:

1. Build the aggregate `TrendChart` dataset from `view_monthly_totals`, pre-seeding every month in the selected range with zeroes.
2. Filter category and tag rows to `type === "spend"` and retain monthly totals for the trendline.
3. Aggregate tag totals for the existing tag bar charts.
4. Avoid keeping unused category summary state in the hook.

The trendline reshapes spend data into Recharts-compatible row objects using safe internal keys:

```
{ month: "Jan 25", k0: 320, k1: 180, ... }
```

The displayed legend/tooltip names still use the original category or tag labels.

---

## What changed from the earlier donut-based plan

- The category-donut idea is dropped in favor of a single spending trendline.
- The implementation does **not** keep a `categories` summary state in `useChartsData`; only data consumed by the UI remains.
- `useChartsData` now owns part of the timeline shaping logic so the aggregate trend bar chart includes zero-value months.
- `SpendingTrendlineChart` receives `startDate` and `endDate` so it can render one tick per month in the selected range, even when a month has no spending rows.

---

## What is unchanged

- Date range pickers at the top of `ChartsTab`  
- `TrendChart` remains the aggregate income/spending/savings bar chart  
- `TagBar` charts (spending and earnings by tag)  
- Top-5 auto-selection remains the default behavior when the item pool changes

---

## Testing

- Add a minimal Playwright smoke test for the Dashboard Charts tab.
- Assert the user can navigate to the `Charts` tab and see:
  - `Income vs Spending vs Savings`
  - `Spending Trendline`
  - `By Tag`

This protects the dashboard route wiring and the presence of the key chart sections without trying to unit-test Recharts internals.

---

## Spec self-review

- No placeholders or TBDs remain  
- Architecture matches feature description  
- Scope is still focused on the Charts tab and its smoke coverage  
- "Top 5 recomputes on date range change" is explicit  
- Missing-month behavior is explicit for both dashboard charts  
- Empty state and safe internal chart keys are defined

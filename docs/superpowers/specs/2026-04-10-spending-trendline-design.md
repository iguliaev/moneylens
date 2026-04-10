# Spending Trendline Chart — Design Spec

**Date:** 2026-04-10  
**Status:** Approved

---

## Problem

The existing Charts tab has three category donut charts (one per transaction type). Donuts show totals over the selected period but give no sense of how spending has changed over time. Users want to track whether a category or tag is growing, shrinking, or spiking.

## Solution

Replace the three category donut charts with a single multi-line trendline chart scoped to **Spending only**. Each line represents one selected category or tag, plotted month-by-month over the selected date range.

---

## Location

Inside `apps/web-next/src/pages/dashboard/ChartsTab.tsx`.  
The `CategoryDonutsRow` component and its rendering block are removed and replaced with a new `SpendingTrendlineChart` component.

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
- **Lines:** One `Line` per selected item, each with a distinct colour from `DONUT_COLORS`  
- **Tooltip:** Shows month + each selected item's spend formatted with `CurrencyTooltipFormatter`  
- **Legend:** Top, 12px font  
- **Points:** `dot={false}`, `activeDot={{ r: 4 }}` — clean lines, dots only on hover  
- **Tension:** `type="monotone"` for smooth curves

### Default selection

When the chart mounts or the date range changes, compute the top 5 items by total spend in that period from the already-fetched `categories` / `tags` state and set them as the initial selection.

### Empty state

When no data exists for the selected items/period, render: _"No spending data for the selected categories in this period."_

---

## Data

No new fetches required. `useChartsData` already fetches:

- `view_monthly_category_totals` → provides `{ month, category, type, total }` rows  
- `view_monthly_tagged_type_totals` → provides `{ month, tags[], type, total }` rows (tags are exploded client-side into per-tag totals)

Filter to `type === 'spend'` client-side. Build a map:

```
{ [month label]: { [categoryOrTag]: totalSpend } }
```

Then reshape into Recharts-compatible row objects:

```
{ month: "Jan 25", "Food & Drink": 320, "Transport": 180, ... }
```

---

## What is removed

- `CategoryDonut` component  
- `CategoryDonutsRow` component  
- The "By Category" section heading and its `<Row>` of three `<Col>` donut cards  
- The `donutData()` helper in `ChartsTab`

The `categories` and `tags` data from `useChartsData` are still used — by the trendline and tag bar charts respectively.

---

## What is unchanged

- Date range pickers at the top of `ChartsTab`  
- `TrendChart` (aggregate income/spending/savings bar chart)  
- `TagBar` charts (spending and earnings by tag)  
- `useChartsData` hook — no changes needed

---

## Spec self-review

- No placeholders or TBDs remain  
- Architecture matches feature description  
- Scope is focused: one component swap, no new data fetches, no new routes  
- "Top 5 recomputes on date range change" is explicit  
- Empty state is defined  

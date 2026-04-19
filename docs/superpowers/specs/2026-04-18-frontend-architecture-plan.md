# Frontend Architecture Improvement Plan

**Date:** 2026-04-18  
**Scope:** `apps/web-next/` — Vite + React 19 + Refine + Ant Design 5  
**Status:** Planning

---

## Executive Summary

The MoneyLens frontend has solid bones (Refine framework, typed Supabase client, component decomposition already begun) but has accumulated architectural debt in three clusters: **data-fetching discipline** (direct Supabase calls bypass Refine), **file organisation** (dashboard is a monolith), and **correctness gaps** (tag association can silently fail, duplicated constants, inconsistent errors). The items below are ordered by the risk and user-impact they carry today.

---

## Priority: High

### H1 — Replace direct Supabase calls in dashboard with Refine `useCustom`

**What**  
`dashboard/index.tsx` contains four plain-async functions (`fetchYearStats`, `fetchMonthStats`, `fetchPrevTypeSummary`) and `ChartsTab.tsx` contains `useChartsData`, all of which call `supabaseClient.from(...)` directly inside `useEffect`. This bypasses every Refine subsystem: caching, background refetch, global loading/error state, and cache invalidation triggered by mutations elsewhere in the app.

`useBudgets.ts` has the same problem for the `get_budget_progress` RPC call.

**Why it matters**  
- Stale dashboard data after a transaction is created/edited — Refine will never know to re-fetch because the query is invisible to it.
- No deduplication: switching tabs triggers independent network requests for the same date range.
- Manual `cancelled` flags and `useState<loading>` boilerplate can be replaced by Refine's proven lifecycle.

**How to do it**

1. For database view queries (`view_monthly_totals`, `view_yearly_totals`, etc.), use Refine's `useList` with `resource` set to the view name and pass filters via the `filters` array:

   ```ts
   useList({
     resource: "view_monthly_totals",
     filters: [
       { field: "month", operator: "gte", value: startDate },
       { field: "month", operator: "lt",  value: endDate },
     ],
     pagination: { mode: "off" },
   })
   ```

   Refine will generate a stable cache key from resource + filters + sorters, so switching between tabs will hit the cache rather than the network.

2. For the `get_budget_progress` RPC in `useBudgets.ts`, use Refine's `useCustom`:

   ```ts
   useCustom<BudgetProgress[]>({
     url: `${SUPABASE_URL}/rest/v1/rpc/get_budget_progress`,
     method: "get",
   })
   ```

   Or use a thin wrapper that delegates to `supabaseClient.rpc` inside a React Query `useQuery` with a stable key — this at least gives cache deduplication and avoids the manual `setLoading` dance.

3. Replace the four `fetchXxxStats` standalone async functions with two hooks — `useYearStats(year: number)` and `useMonthStats(year: number, month: number)` — each internally composing two `useList` calls and returning the combined, mapped result. These hooks live in a new `src/hooks/` directory.

4. The previous-period comparison currently calls a third fetch in `usePeriodStats`. Move this into each new hook as a second `useList` with `enabled: true` and shift the date arithmetic into a pure helper `getPreviousPeriodRange(period, date)` in `src/utility/dateRanges.ts`.

**Files to change**
- `src/pages/dashboard/index.tsx` — remove all direct Supabase calls and the `usePeriodStats` hook body
- `src/pages/dashboard/ChartsTab.tsx` — remove `useChartsData` body
- `src/pages/dashboard/useBudgets.ts` — replace `supabaseClient.rpc` with `useCustom` or `useQuery`
- New: `src/hooks/usePeriodStats.ts`, `src/hooks/useChartsData.ts`, `src/utility/dateRanges.ts`

**Risk / complexity:** Medium-High. The hook logic is straightforward but the Refine `useList` filter syntax for DB views needs testing. Each hook should be extracted and unit-tested in isolation before removing the old code.

---

### H2 — Make transaction tag association atomic (create & edit)

**What**  
In `transactions/create.tsx` and `transactions/edit.tsx`, tags are saved by calling `supabaseClient.rpc("set_transaction_tags", ...)` *after* `formProps.onFinish()` succeeds. If the RPC fails (network hiccup, auth expiry, DB error), the transaction exists without its tags and the user sees a toast error but no rollback path. Additionally, on create the transaction ID is obtained by casting the opaque return value of `onFinish` — a brittle type assertion `(result as unknown as { data?: { id?: string } })`.

**Why it matters**  
User data integrity: a transaction silently misses its tags. This is especially hard to detect because the transaction list shows no tags column.

**How to do it**

*Option A — Move tag logic to the database (preferred)*  
Create a Postgres function `create_transaction_with_tags(p_transaction jsonb, p_tag_ids uuid[]) RETURNS transactions` that inserts the transaction and calls `set_transaction_tags` in one database transaction. Call this from the frontend via `useCustom` with `method: "post"` or directly via `supabaseClient.rpc`. This makes the operation truly atomic.

*Option B — Frontend retry with clear UX (interim)*  
If the RPC call fails:
1. Show a non-dismissible Ant Design notification that includes a "Retry tagging" action button, passing the already-known `transactionId` and `tag_ids` stored in `useRef`.
2. Store the pending tag payload in `localStorage` keyed by transaction ID; on next page load, prompt the user to complete the association.

Regardless of chosen option:
- Remove the `(result as unknown as ...)` cast. Refine's `useForm` `onFinish` return type should be typed or the mutation should be obtained directly via `useCreate` so the returned `data.id` is strongly typed.
- The `handleFinish` pattern is duplicated verbatim in `create.tsx` and `edit.tsx`. Extract it to `src/hooks/useTransactionForm.ts` so both pages share one implementation.

**Files to change**
- `src/pages/transactions/create.tsx`
- `src/pages/transactions/edit.tsx`
- New: `src/hooks/useTransactionForm.ts`
- New migration: `supabase/migrations/YYYYMMDDHHMMSS_create_transaction_with_tags.sql` (Option A)

**Risk / complexity:** Medium. Option A requires a DB migration and collaboration with the backend layer; Option B can be done purely in the frontend. Option A is strongly recommended to ensure correctness.

---

### H3 — Decompose `dashboard/index.tsx` into focused files

**What**  
`dashboard/index.tsx` currently contains, in one 579-line file: four TypeScript type declarations, four DB-view type aliases, three constants blocks, four standalone async functions, one compound data hook (`usePeriodStats`), two presentation components (`TrendBadge`, `TypeSummaryCards`), two table components (`CategoryBreakdownTable`, `CategoryBreakdownSection`), and the page component (`DashboardPage`).

`ChartsTab.tsx` has a similar problem: 587 lines mixing a data hook, four sub-components, and the tab root.

**Why it matters**  
- Hard to navigate and review.
- Sub-components cannot be individually tested or reused.
- Type declarations buried inside files are invisible to tooling that scans `src/types/`.

**How to do it**

Target file structure after decomposition:

```
src/
  hooks/
    usePeriodStats.ts          # H1 — data fetching hook
    useChartsData.ts           # H1 — charts data hook
    useTransactionForm.ts      # H2 — shared tag-handling logic
  types/
    dashboard.ts               # CategorySummary, TypeSummary, PeriodStats, Period
    charts.ts                  # TrendPoint, TagTotal, CategorySpendPoint, TagSpendPoint
  pages/
    dashboard/
      index.tsx                # Page shell only: tab layout, period selectors, BudgetsSection
      components/
        TrendBadge.tsx
        TypeSummaryCards.tsx
        CategoryBreakdownTable.tsx
        CategoryBreakdownSection.tsx
        PeriodTab.tsx          # Yearly/Monthly tab content (selector + cards + breakdown)
      ChartsTab/
        index.tsx              # ChartsTab root (date range state, useChartsData call)
        TrendChart.tsx
        SpendingTrendlineChart.tsx
        TagBar.tsx
      useBudgets.ts            # (stays here — budget-specific hook)
      BudgetsSection.tsx
```

Migration steps:
1. Move type declarations to `src/types/dashboard.ts` and `src/types/charts.ts`.
2. Move utility constants (`yearOptions`, `monthOptions`, `currentYear`) — see H4.
3. Extract `TrendBadge` → `src/pages/dashboard/components/TrendBadge.tsx`.
4. Extract `TypeSummaryCards` → `src/pages/dashboard/components/TypeSummaryCards.tsx`.
5. Extract `CategoryBreakdownTable` + `CategoryBreakdownSection` → separate files.
6. The repeated yearly/monthly tab content (selector + cards + breakdown) is structurally identical; extract to `PeriodTab.tsx` taking `period`, `stats`, and `onYearChange`/`onMonthChange` as props.
7. Move the `ChartsTab` sub-components into `ChartsTab/` subdirectory as shown.
8. After H1, `index.tsx` should contain only: period state, date range computation, `usePeriodStats` calls, and the `<Tabs>` shell — targeting ≤80 lines.

Each extraction step is safe to do independently. Start with the leaf components (no imports from siblings) and work inward.

**Files to change**
- `src/pages/dashboard/index.tsx` (major surgery — extract outward)
- `src/pages/dashboard/ChartsTab.tsx` (major surgery — extract outward)
- Many new files as listed above

**Risk / complexity:** Low-Medium per extraction. Zero logic changes; pure relocation. Biggest risk is import cycle if ordering is wrong — extract leaf components first.

---

## Priority: Medium

### M1 — Replace `useList` with `useSelect` for tag options

**What**  
`transactions/create.tsx` and `transactions/edit.tsx` both fetch tags with `useList` and then manually map `data.data` to `{ label, value }` inside a `useMemo`. Refine's `useSelect` already does exactly this mapping, participates in Refine's cache, and provides standard `selectProps` to spread onto `<Select>`.

**Why it matters**  
Code duplication, missed caching, and inconsistency with how `categories` and `bank_accounts` are already fetched via `useSelect` in the same files.

**How to do it**

Replace:
```ts
const { query: tagsQuery } = useList({ resource: "tags", ... });
const tagOptions = useMemo(() => tagsQuery.data?.data?.map(...) ?? [], [...]);
```

With:
```ts
const { selectProps: tagSelectProps } = useSelect({
  resource: "tags",
  optionLabel: "name",
  optionValue: "id",
  pagination: { mode: "off" },
  sorters: [{ field: "name", order: "asc" }],
});
```

Then spread `{...tagSelectProps}` onto the `<Select mode="multiple">` in the Tags form item. Note: `useSelect` defaults to `filterOption: false` (server-side filtering); add `filterOption` prop back if client-side search is needed.

**Files to change**
- `src/pages/transactions/create.tsx`
- `src/pages/transactions/edit.tsx`

**Risk / complexity:** Low.

---

### M2 — Eliminate duplicated constants and utilities

**What**  
The following are defined more than once across the codebase:

| Symbol | Duplicated in |
|---|---|
| `currentYear`, `yearOptions`, `monthOptions` | `dashboard/index.tsx` and `ChartsTab.tsx` |
| `isTransactionType` type guard | `dashboard/index.tsx` and `ChartsTab.tsx` |
| `formatCurrencyLocal` | `dashboard/index.tsx` (already exists as `formatCurrency` in `src/utility/currency.ts`) |

**Why it matters**  
Any change to the options range (e.g., extending to 10 years) or the currency formatter must be made in multiple places; one of them will be missed.

**How to do it**

1. Move `yearOptions`, `monthOptions`, `currentYear` to `src/constants/dateOptions.ts`. Export and import in both dashboard files.
2. Move `isTransactionType` to `src/constants/transactionTypes.ts` (it already lives nearby). Re-export from there.
3. In `dashboard/index.tsx`, replace `formatCurrencyLocal` with the existing `formatCurrency` from `src/utility/currency.ts`. Verify the signature matches (it takes `(amount, currency)` — same as the inline version).

**Files to change**
- New: `src/constants/dateOptions.ts`
- `src/constants/transactionTypes.ts`
- `src/pages/dashboard/index.tsx`
- `src/pages/dashboard/ChartsTab.tsx`
- `src/utility/currency.ts` (confirm export exists)

**Risk / complexity:** Low.

---

### M3 — Standardise error handling across data-fetching hooks

**What**  
Current error handling is inconsistent:

| Location | Pattern |
|---|---|
| `usePeriodStats` | `message.error(...)` on catch |
| `useChartsData` | `message.error(...)` on catch |
| `useBudgets` | `message.error(...)` + `console.error` on error |
| `transactions/create.tsx` | `message.error(...)` + `console.error` in catch |
| `budgets/create.tsx` | Inconsistent (some throw, some use `message.error`) |
| `softDeleteDataProvider.ts` | `Promise.reject(error)` (correct) |

There is no centralised error reporting. `message.error` from Ant Design is used ad-hoc while Refine's notification system (`useNotification`) — which is already configured in `App.tsx` via `notificationProvider={useNotificationProvider}` — is ignored.

**Why it matters**  
- Refine's notification provider is already wired up and provides consistent UX (position, duration, dismiss). Using `message.error` directly bypasses it.
- Some errors are silently swallowed (only `console.error`) with no user feedback.
- No way to globally suppress/redirect error toasts in tests.

**How to do it**

1. In all custom hooks that do data fetching, replace `message.error(...)` with Refine's `useNotification` hook:
   ```ts
   const { open } = useNotification();
   // in catch:
   open({ type: "error", message: "Failed to load statistics", description: String(err) });
   ```

2. For hooks that cannot use `useNotification` (non-component context), surface the error in their return value (`error: Error | null`) and let the consuming component decide how to display it.

3. For RPC calls in transaction forms (H2 addresses the atomicity issue), ensure the error path always shows a user-visible notification — never only `console.error`.

4. Document the convention in a brief comment at the top of `src/utility/index.ts`:
   > Direct Supabase calls outside Refine hooks must surface errors via `useNotification` or return them to the caller. Never silently swallow.

**Files to change**
- `src/pages/dashboard/index.tsx` (after H1, in new hook files)
- `src/pages/dashboard/useBudgets.ts`
- `src/pages/dashboard/ChartsTab.tsx` (after H1)
- `src/pages/transactions/create.tsx`
- `src/pages/transactions/edit.tsx`

**Risk / complexity:** Low-Medium. The Refine `useNotification` hook requires a React component context, so hooks that are currently called from utility functions need slight restructuring to accept the notifier as a parameter or be moved inside components.

---

### M4 — Extract a shared `DateRangePicker` component

**What**  
Both `dashboard/index.tsx` (year/month selectors) and `ChartsTab.tsx` (start/end year/month selectors) implement bespoke date-range pickers using four `<Select>` components. The options lists, layout, and label styling are duplicated.

**Why it matters**  
Any UX change (e.g., switching to Ant Design `DatePicker.RangePicker` with month granularity) would need to be made in two places. The current selectors also lack any validation that `startDate < endDate`.

**How to do it**

1. Create `src/components/MonthRangePicker.tsx` — a controlled component accepting:
   ```ts
   interface MonthRangePickerProps {
     startYear: number; startMonth: number;
     endYear: number;   endMonth: number;
     onChange: (range: { startYear, startMonth, endYear, endMonth }) => void;
     singleMonth?: boolean; // dashboard stats tabs only need one month, not a range
   }
   ```
2. Replace the inline selector blocks in both dashboard files with `<MonthRangePicker>`.
3. Add validation: if `endDate <= startDate`, disable the data fetch and show an inline warning.

**Files to change**
- New: `src/components/MonthRangePicker.tsx`
- `src/pages/dashboard/index.tsx`
- `src/pages/dashboard/ChartsTab.tsx`

**Risk / complexity:** Low.

---

## Priority: Low

### L1 — Add a shared `src/hooks/` directory with index barrel export

**What**  
There is currently no `src/hooks/` directory. All custom hooks live next to the pages that first needed them (e.g., `useBudgets.ts` inside `pages/dashboard/`). As H1 and H2 create new shared hooks, they need a canonical home.

**How to do it**

1. Create `src/hooks/` with an `index.ts` barrel that re-exports all shared hooks.
2. Move `useBudgets.ts` if budget progress data is ever needed outside the dashboard; otherwise leave it co-located.
3. New hooks from H1 (`usePeriodStats`, `useChartsData`) and H2 (`useTransactionForm`) land here.

**Files to change**
- New: `src/hooks/index.ts`
- New: `src/hooks/usePeriodStats.ts`
- New: `src/hooks/useChartsData.ts`
- New: `src/hooks/useTransactionForm.ts`

**Risk / complexity:** Very low.

---

### L2 — Strengthen TypeScript typing for Refine `onFinish` return value

**What**  
In `transactions/create.tsx`:
```ts
const transactionId = (result as unknown as { data?: { id?: string } })?.data?.id;
```
This double cast (`as unknown as`) indicates the return type of `formProps.onFinish` is not known at compile time. If Refine changes its return shape, this silently breaks.

**How to do it**

1. Check the Refine `useForm` generic parameters — `useForm<Transaction>()` should type the mutation result correctly.
2. Use `useCreate` directly alongside `useForm` if finer control over the mutation result is needed (this also unlocks typed `data.data.id`).
3. Add a runtime assertion: if `transactionId` is nullish after a successful `onFinish`, log a structured error with enough context to debug.

After H2 (Option A), this problem disappears because tag association moves to the database.

**Files to change**
- `src/pages/transactions/create.tsx`

**Risk / complexity:** Low.

---

### L3 — Audit and document the pattern for Supabase RPC calls that must stay in the frontend

**What**  
Several features legitimately require direct `supabaseClient` calls that cannot (or should not) go through Refine's generic data provider:
- `set_transaction_tags` RPC (transactions)
- `get_budget_progress` RPC (budgets)
- `bulk_upload_data` and `reset_user_data` RPCs (settings)
- Auth operations (`supabaseClient.auth.*`) — correct by definition

These should be catalogued and distinguished from the accidental bypasses covered in H1.

**How to do it**

1. Add a `// INTENTIONAL_DIRECT_SUPABASE: <reason>` comment above each legitimate direct call so reviewers can distinguish intent from oversight.
2. For RPCs, consider wrapping each in a thin typed function in `src/utility/rpc.ts`:
   ```ts
   export const getBudgetProgress = () =>
     supabaseClient.rpc("get_budget_progress");
   export const setTransactionTags = (transactionId: string, tagIds: string[]) =>
     supabaseClient.rpc("set_transaction_tags", { p_transaction_id: transactionId, p_tag_ids: tagIds });
   ```
   This centralises RPC names (preventing typos), enables mocking in tests, and makes the inventory visible.

**Files to change**
- New: `src/utility/rpc.ts`
- `src/pages/dashboard/useBudgets.ts`
- `src/pages/transactions/create.tsx`
- `src/pages/transactions/edit.tsx`
- `src/pages/settings/index.tsx`

**Risk / complexity:** Very low. Purely additive.

---

## Implementation Order Recommendation

```
Week 1:  H3 (decompose dashboard) — no logic change, high clarity gain
Week 1:  M2 (deduplicate constants) — safe, tiny, should go first to unblock H3
Week 2:  H1 (replace Supabase calls with Refine hooks) — depends on H3 for clean targets
Week 2:  M1 (useSelect for tags) — small, can be parallelised
Week 3:  H2 (atomic tag association) — DB migration needs coordination
Week 3:  M3 (standardise error handling) — clean up as H1/H2 land
Week 4:  M4, L1, L2, L3 — polish and structural hygiene
```

Each item is independently releasable. Items within the same week can be parallelised across developers.

---

## Appendix: Files at a Glance

| File | Lines | Issues |
|---|---|---|
| `pages/dashboard/index.tsx` | 579 | H1, H3, M2, M3 |
| `pages/dashboard/ChartsTab.tsx` | 587 | H1, H3, M2, M3 |
| `pages/dashboard/useBudgets.ts` | 46 | H1, M3 |
| `pages/transactions/create.tsx` | 168 | H2, M1, L2 |
| `pages/transactions/edit.tsx` | 214 | H2, M1 |
| `pages/budgets/create.tsx` | — | M3 (direct Supabase) |
| `pages/budgets/edit.tsx` | — | M3 (direct Supabase) |
| `pages/settings/index.tsx` | — | L3 (legitimate RPC) |

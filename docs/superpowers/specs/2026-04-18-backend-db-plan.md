# Backend & Database Improvement Plan

**Date:** 2026-04-18  
**Scope:** PostgreSQL 17 / Supabase layer (`supabase/`) and the Supabase client usage in `apps/web-next/`

---

## Context Summary

MoneyLens persists financial data in PostgreSQL 17 via Supabase. The schema is well-structured — RLS on every table, `SECURITY INVOKER` views, `search_path = ''` on all RPCs — but several gaps remain in performance, correctness, test coverage, and data-model completeness. This document catalogues each gap and prescribes concrete remediation steps.

---

## 1. Performance

### 1.1 Missing Date Index on `transactions`

**What**  
The baseline migration (`20260201164000`) creates no index on `transactions.date` or the composite `(user_id, date)`. The soft-delete migration adds `idx_transactions_user_deleted (user_id, deleted_at)` but still omits `date`. Every analytics view (`view_monthly_totals`, `view_monthly_category_totals`, `view_monthly_tagged_type_totals`, etc.) performs `DATE_TRUNC('month', date)` range scans scoped to a user and a time window. As transaction count grows these become sequential scans.

**Why it matters**  
The dashboard issues up to six parallel Supabase queries on mount (current period + previous period, type totals + category totals, sometimes chart data). All of them hit the `transactions` table with a date-range predicate. A missing index means every query does a full per-user table scan — O(n) per query, six queries per page load. At 1 000 transactions the impact is already noticeable; at 10 000 it becomes a bottleneck.

**How to implement**

Create a new migration (e.g. `20260419000000_add_transaction_date_indexes.sql`):

```sql
-- Composite index covering the most common analytics access pattern:
-- filter by user + soft-delete, order/range by date
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON public.transactions (user_id, date DESC)
    WHERE deleted_at IS NULL;

-- Separate composite for type-filtered queries (view_monthly_totals, etc.)
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
    ON public.transactions (user_id, type, date DESC)
    WHERE deleted_at IS NULL;
```

Both are partial indexes (`WHERE deleted_at IS NULL`) so they are small, always current, and directly satisfy the `deleted_at IS NULL` predicate already in every view.

**Risk:** Additive DDL only. No data migration. Indexes build concurrently on an active database; use `CREATE INDEX CONCURRENTLY` on production to avoid table locks.

---

### 1.2 Correlated Subqueries in `budgets_with_linked`

**What**  
`budgets_with_linked` uses two correlated scalar subqueries per row (one for `category_count`, one for `tag_count`). With many budgets this means N×2 sub-selects.

**Why it matters**  
The budget list page renders this view for every row. As a user accumulates budgets the view degrades quadratically relative to budget × (category + tag) links.

**How to implement**  
Replace the correlated subqueries with `LEFT JOIN … GROUP BY` aggregations in the view definition:

```sql
CREATE OR REPLACE VIEW public.budgets_with_linked
WITH (security_invoker = TRUE) AS
SELECT
    b.*,
    COALESCE(bc_counts.cnt, 0) AS category_count,
    COALESCE(bt_counts.cnt, 0) AS tag_count
FROM public.budgets b
LEFT JOIN (
    SELECT bc.budget_id, COUNT(*) AS cnt
    FROM public.budget_categories bc
    JOIN public.categories c ON c.id = bc.category_id AND c.deleted_at IS NULL
    GROUP BY bc.budget_id
) bc_counts ON bc_counts.budget_id = b.id
LEFT JOIN (
    SELECT bt.budget_id, COUNT(*) AS cnt
    FROM public.budget_tags bt
    JOIN public.tags t ON t.id = bt.tag_id AND t.deleted_at IS NULL
    GROUP BY bt.budget_id
) bt_counts ON bt_counts.budget_id = b.id
WHERE b.deleted_at IS NULL;
```

**Risk:** View-only change, no data migration. Wrap in a migration file. Verify the result columns are identical to the existing view before deploying.

---

## 2. Correctness & Testing

### 2.1 No pgTAP Tests for `get_budget_progress()`

**What**  
`get_budget_progress()` is a 60-line SQL function with non-trivial deduplication logic (UNION-based to avoid double-counting transactions that match via both a category link and a tag link). It has zero test coverage.

**Why it matters**  
A silent regression (e.g., a UNION ALL replacing UNION, or a date-range predicate being dropped) would cause budgets to show incorrect progress without any automated signal. The function is called on every dashboard load for authenticated users.

**How to implement**  
Create `supabase/tests/budget_progress_test.sql` with the following scenarios:

| # | Scenario | Expected |
|---|---|---|
| 1 | Budget with only category link, matching transaction | `current_amount` = transaction amount |
| 2 | Budget with only tag link, matching transaction | `current_amount` = transaction amount |
| 3 | Transaction matches via BOTH category and tag link | `current_amount` = amount once (deduplication) |
| 4 | Transaction outside `start_date`/`end_date` window | Not counted |
| 5 | Soft-deleted transaction | Not counted |
| 6 | Budget with no matching transactions | `current_amount` = 0 (COALESCE) |
| 7 | Budget for different `type` than transaction | Not counted |
| 8 | Soft-deleted budget | Not returned |
| 9 | User isolation — another user's transactions not counted | |
| 10 | Budget with linked soft-deleted category | Category not counted |

Test structure mirrors `aggregation_logic_test.sql`: `BEGIN`, `SELECT plan(N)`, test data using CTEs + `INSERT`, `authenticate_as`, `results_eq` / `ok` assertions, `ROLLBACK`.

---

### 2.2 `view_monthly_tagged_type_totals` — Edge Cases Not Tested

**What**  
`aggregation_logic_test.sql` tests happy-path tagged totals but does not cover:
- A month where *no* transactions are tagged (the view correctly returns no rows for that month, but this is not explicitly asserted)
- Soft-deleted transactions being excluded from tag aggregations
- The tag deduplication within the `ARRAY_AGG(DISTINCT …)` CTE when a transaction has multiple tags

**Why it matters**  
The view drives the "By Tag" chart in `ChartsTab`. If soft-deleted transactions leak into chart data, or if tag grouping degrades, the chart silently mis-represents the user's finances.

**How to implement**  
Extend `aggregation_logic_test.sql` with three new test cases (incrementing `SELECT plan()`):

1. **Soft-delete exclusion** — insert a tagged transaction, soft-delete it (`UPDATE … SET deleted_at = NOW()`), assert it does not appear in `view_monthly_tagged_type_totals`.
2. **Zero-tag month** — insert an untagged transaction in month M, assert that no row appears for month M in the view (the `ARRAY_LENGTH(tags, 1) > 0` filter is the gate).
3. **Multi-tag grouping** — insert a transaction tagged with `['groceries', 'essentials']`, assert it appears as a single row with `tags = ARRAY['essentials','groceries']` (sorted by `ARRAY_AGG … ORDER BY name`) and that its amount is not double-counted.

---

### 2.3 `reset_user_data` — Budget Cleanup Already Tested (Confirmation)

**What**  
`reset_user_data_test.sql` fully covers budget cleanup: it verifies `budgets`, `budget_categories`, and `budget_tags` are all zeroed for the reset user while the other user's budgets remain intact (tests 1, 3, and 4). No action required here.

**Status:** ✅ Already covered.

---

### 2.4 ~~No Database-Level CHECK Constraint on `transactions.amount`~~ — _Removed_

**Decision:** Negative amounts on `transactions` are **intentional by design**. For example, a reversal or refund entered directly as a negative spend is a valid use case. Adding a `CHECK (amount > 0)` constraint would break this deliberately supported workflow.

The `budgets` table `CHECK (target_amount > 0)` remains correct because a budget target must always be a positive goal amount.

No migration needed for this item.

---

### 2.5 Dual Tag Storage Inconsistency (`tags TEXT[]` vs `transaction_tags`)

**What**  
The `transactions` table retains a legacy `tags TEXT[]` column. The new system uses the `transaction_tags` junction table. Two views use each approach:
- `tags_with_usage` unnests `transactions.tags` (legacy array) to compute `in_use_count`
- `view_monthly_tagged_type_totals` joins via `transaction_tags` (new junction table)

This means `in_use_count` on a tag could be wrong if some transactions still rely on the legacy array but have no entry in `transaction_tags` (or vice versa).

**Why it matters**  
Correctness of the "in use" badge on the Tags list page, and potential silent discrepancies between what the chart shows and what the tags list shows.

**How to implement**  
1. Audit: count rows where `transaction_tags` has entries that don't match `transactions.tags` text array, and vice versa.
2. Decide on canonical source of truth: recommend `transaction_tags` (normalized, references known tag IDs).
3. Migrate any legacy `tags TEXT[]` data into `transaction_tags` entries, then deprecate the column or keep it as a denormalized cache (clearly documented).
4. Update `tags_with_usage` to use `transaction_tags` instead of unnesting `transactions.tags`.
5. Eventually mark `transactions.tags` as `-- deprecated` and add a migration to drop it once data is confirmed migrated.

**Risk:** Medium — data migration needed. All existing app code that reads/writes the `tags TEXT[]` column must be audited and updated in the same change set.

---

## 3. Data Model Improvements

### 3.1 No `user_settings` Table

**What**  
Currency preference (`USD`, `GBP`, etc.) is stored exclusively in the browser's `localStorage` via `CurrencyContextProvider`. There is no server-side record of this preference.

**Why it matters**  
- **Cross-device sync:** A user on a second device (or after clearing browser storage) sees the default currency, not their chosen one.
- **Correctness:** Currency is display-critical — it affects how all monetary values are labelled and formatted.
- **Future-proofing:** Any future backend-driven feature (email summaries, reports) has no currency context to use.

**How to implement**  
Create a new migration `20260419000002_add_user_settings.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id  UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'USD'
                  CHECK (char_length(currency) = 3),  -- ISO 4217
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON public.user_settings
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_settings_insert ON public.user_settings
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_settings_update ON public.user_settings
    FOR UPDATE USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS tg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER tg_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
```

**Frontend integration steps:**
1. On first load, read from Supabase `user_settings`; fall back to `localStorage` value for backward compatibility.
2. On currency change in Settings page, upsert into `user_settings` (and keep `localStorage` in sync for offline resilience).
3. Add `user_settings` to the pgTAP test suite: verify RLS isolation between users and that the ISO 4217 CHECK constraint rejects invalid codes.

**Risk:** Additive DDL, no breaking changes. `localStorage` fallback ensures existing users are unaffected.

---

### 3.2 `budgets` Date Range — Optional But Not Defaulted

**What**  
`budgets.start_date` and `budgets.end_date` are both nullable with no default. `get_budget_progress()` handles `NULL` correctly (`b.start_date IS NULL OR tx.date >= b.start_date`). However, there is no way to tell from the data whether a budget is "open-ended by design" or "never had dates set because the UI didn't enforce it."

**Why it matters**  
Future features (recurring budgets, monthly reset) will need to know intent. A budget with `start_date = NULL` is ambiguous.

**How to implement**  
- No immediate schema change required, but add a `COMMENT ON COLUMN` clarifying the null semantics.
- When implementing recurring budgets, add a `period` enum column (`once`, `monthly`, `yearly`) and generate `start_date`/`end_date` from it.

**Risk:** Low — documentation only for now.

---

### 3.3 Missing Index on `transaction_tags.tag_id` for Budget Progress Lookups

**What**  
`get_budget_progress()` joins `transaction_tags tt ON tt.tag_id = bt.tag_id`. The index `idx_transaction_tags_tag ON public.transaction_tags (tag_id)` exists — this is already correct.

**Status:** ✅ Already covered.

---

## 4. Real-time

### 4.1 `liveProvider` Configured but Never Used

**What**  
`App.tsx` wires `liveProvider(supabaseClient)` into Refine. No resource, page, or hook in the application passes `liveMode` or calls `useLiveMode`. The dashboard `usePeriodStats` hook fetches data imperatively on mount and on date-picker changes, with no subscription.

**Why it matters**  
- **Stale data:** If two browser tabs are open (or a teammate adds a transaction on mobile), the dashboard does not update until the user manually refreshes or changes the date selector.
- **Missed value:** The live infrastructure is already paid for (Supabase Realtime is included); the front-end just doesn't consume it.

**How to implement**  

**Option A — Refine `useLiveMode` on resources (lower effort)**  
Add `liveMode: "auto"` to the resources that change most frequently (`transactions`). Refine will automatically invalidate list queries when the Supabase channel fires:

```tsx
// In App.tsx options:
options={{
  liveMode: "auto",
  // ...
}}
```

This covers the TransactionList page automatically but does not refresh the custom `usePeriodStats` hook on the dashboard.

**Option B — Supabase Realtime channel in `usePeriodStats` (higher value)**  
Subscribe to the `transactions` table channel and refetch stats when INSERT/UPDATE/DELETE events arrive for the current user. Pattern:

```ts
useEffect(() => {
  const channel = supabaseClient
    .channel('transactions-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'transactions',
      filter: `user_id=eq.${userId}`,
    }, () => {
      fetchData(); // re-run the stats fetch
    })
    .subscribe();

  return () => { supabaseClient.removeChannel(channel); };
}, [userId, startDate, endDate]);
```

This makes the dashboard live without any page reload.

**Recommendation:** Implement Option B for the dashboard (it directly addresses the most data-critical view), then apply Option A globally to get list-page freshness for free.

**Risk:** Low — purely additive. Be mindful of debouncing rapid consecutive events (e.g., a bulk import) to avoid many redundant re-fetches. A 500 ms debounce on `fetchData` is sufficient.

---

## 5. Summary Table

| # | Category | Item | Effort | Risk | Priority |
|---|---|---|---|---|---|
| 1.1 | Performance | Add `(user_id, date)` index on `transactions` | Low | None | 🔴 High |
| 1.2 | Performance | Rewrite `budgets_with_linked` to avoid correlated subqueries | Low | None | 🟡 Medium |
| 2.1 | Testing | pgTAP tests for `get_budget_progress()` | Medium | None | 🔴 High |
| 2.2 | Testing | Edge-case tests for `view_monthly_tagged_type_totals` | Low | None | 🟡 Medium |
| ~~2.4~~ | ~~Correctness~~ | ~~CHECK constraint on `transactions.amount`~~ | — | — | _Removed — negative amounts intentional_ |
| 2.5 | Correctness | Resolve dual tag storage (`tags TEXT[]` vs `transaction_tags`) | High | Medium | 🟡 Medium |
| 3.1 | Data Model | Add `user_settings` table for currency + RLS | Medium | None | 🔴 High |
| 3.2 | Data Model | Document `budgets` nullable date semantics | Low | None | 🟢 Low |
| 4.1 | Real-time | Wire Supabase Realtime into dashboard `usePeriodStats` | Medium | None | 🟡 Medium |

---

## 6. Recommended Implementation Order

1. **1.1 — Date index** (one migration, five minutes, immediate measurable impact)
2. **3.1 — `user_settings` table** (migration + frontend wiring)
3. **2.1 — Budget progress pgTAP tests** (coverage for existing complex logic)
4. **2.2 — Tag view edge-case tests** (extend existing test file)
5. **1.2 — `budgets_with_linked` view rewrite** (performance, low risk)
6. **4.1 — Dashboard real-time subscriptions** (UX improvement)
7. **2.5 — Dual tag storage resolution** (requires full audit, do last)

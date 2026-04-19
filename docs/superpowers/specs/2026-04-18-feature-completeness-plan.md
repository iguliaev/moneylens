# MoneyLens — Feature Completeness Plan

**Date**: 2026-04-18  
**Status**: Draft  
**Scope**: Phase 4 / 4b / 5 feature gaps from `docs/improvement-roadmap.md`

---

## Overview

This document provides an actionable implementation plan for all open feature-completeness gaps. Items are ordered by the composite score of **user value × implementation feasibility** — highest-impact, lowest-effort items first. Dependencies are called out explicitly; `user_settings` is the critical foundation for several others.

### Priority Matrix

| # | Feature | User Value | Complexity | Depends On |
|---|---------|-----------|-----------|------------|
| 1 | [Currency persistence (`user_settings`)](#1-currency-persistence--user_settings-table) | 🔴 High | 🟡 Medium | — |
| 2 | [Quick-add transaction in KBar](#2-quick-add-transaction-in-kbar) | 🟠 Medium-High | 🟢 Low | — |
| 3 | [CSV export](#3-csv-export) | 🔴 High | 🟢 Low | — |
| 4 | [Bulk-upload JSON template download](#4-bulk-upload-downloadable-json-template) | 🟡 Medium | 🟢 Low | — |
| 5 | [User profile page](#5-user-profile-page) | 🟠 Medium-High | 🟡 Medium | #1 |
| 6 | [Bank account running balance](#6-bank-account-running-balance) | 🔴 High | 🟡 Medium | — |
| 7 | [Budget trajectory projection](#7-budget-trajectory-projection) | 🟠 Medium-High | 🟡 Medium | — |
| 8 | [Recurring transactions](#8-recurring-transaction-support) | 🔴 High | 🔴 High | — |

---

## 1. Currency Persistence — `user_settings` Table

### What
Persist the user's currency preference (and future preferences such as `date_format`) in a Supabase table so the choice roams with the account across devices and browsers.

### Why
`CurrencyContextProvider` currently initialises from `localStorage` only (`localStorage.getItem("moneylens_currency")`). Any new device or private-browsing session resets to the `GBP` default. This is a silent, invisible data-loss bug for multi-device users.

### How

#### Backend (Supabase migration)

1. **New migration** `supabase migration new add_user_settings`

2. **Table DDL**:
   ```sql
   CREATE TABLE public.user_settings (
     user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     currency   TEXT NOT NULL DEFAULT 'GBP',
     date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

3. **RLS** — owner-only SELECT / INSERT / UPDATE (same pattern as `categories`):
   - `user_id = auth.uid()` on all policies.
   - No DELETE policy — the row is permanent (cleaned up via `auth.users` CASCADE).

4. **Triggers** — attach existing `tg_set_updated_at` and `tg_set_user_id` triggers.

5. **RPC `get_or_create_user_settings()`**:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_or_create_user_settings()
   RETURNS public.user_settings
   LANGUAGE sql SECURITY INVOKER
   SET search_path = ''
   AS $$
     INSERT INTO public.user_settings (user_id)
     VALUES (auth.uid())
     ON CONFLICT (user_id) DO NOTHING;

     SELECT * FROM public.user_settings WHERE user_id = auth.uid();
   $$;
   ```
   Grant `EXECUTE` to `authenticated`.

6. **Upsert helper RPC `update_user_settings(p_currency text, p_date_format text)`** — or rely on the direct PostgREST UPSERT (`supabaseClient.from('user_settings').upsert(...)`).

7. **Update `types.gen.ts`** after migration: `supabase gen types typescript --local > types.gen.ts`.

#### Frontend (`apps/web-next`)

1. **`CurrencyContextProvider`** (`src/contexts/currency/index.tsx`):
   - On mount, call `get_or_create_user_settings()` via `supabaseClient.rpc(...)`.
   - Seed `useState` with the DB value; keep `localStorage` as an offline cache / optimistic fallback.
   - In `setCurrency`: call `supabaseClient.from('user_settings').upsert({ user_id, currency })` in addition to `localStorage.setItem`.
   - Show a subtle loading state (context value stays as `localStorage` fallback during the async fetch so the UI is never blocked).

2. **Dependency note**: The context already wraps the whole app (`App.tsx` line 75), so no routing changes are needed. The hook signature (`useCurrency()`) stays identical — zero breaking changes to consumers.

### Risk / Complexity
**Medium.** The migration and RLS pattern are routine given the existing codebase conventions. The main risk is a brief flash of the wrong default currency on first load — mitigated by using `localStorage` as an optimistic initial value.

---

## 2. Quick-Add Transaction in KBar

### What
Register a `"Add Transaction"` action in RefineKbar so users can open the transaction creation form via the command palette (`Cmd+K` / `Ctrl+K`).

### Why
`RefineKbarProvider` and `<RefineKbar />` are already wired in `App.tsx` (lines 11, 73, 287). The command palette is live but holds only the default Refine navigation actions. Adding a quick-add shortcut is the highest-ROI UX enhancement relative to effort.

### How

#### Frontend only

1. **Custom KBar action** — use Refine's `useRegisterActions` hook (from `@refinedev/kbar` or `kbar` directly) in a new component `<KBarActions />` mounted inside `<RefineKbarProvider>` but outside any route.

   ```ts
   useRegisterActions([
     {
       id: "create-transaction",
       name: "Add Transaction",
       shortcut: ["t"],
       keywords: "add spend earn save money transaction",
       section: "Actions",
       icon: <SwapOutlined />,
       perform: () => go({ to: "/transactions/create" }),
     },
   ], []);
   ```

2. Render `<KBarActions />` inside `App.tsx` immediately after `<RefineKbarProvider>`.

3. Optionally register a "Add Budget" action the same way.

### Risk / Complexity
**Low.** Pure frontend, no backend, no schema changes. The main concern is ensuring `useNavigate` / Refine's `useGo` hook is available in the component tree — which it is since Refine wraps the router.

---

## 3. CSV Export

### What
A "Export CSV" button on the Transactions list page that downloads the currently-filtered transactions as a `.csv` file.

### Why
Power users want to import data into spreadsheets or external tools. This is consistently the most-requested data-portability feature in personal finance apps and was explicitly called out in the Phase 4 roadmap.

### How

#### Option A — Client-side (recommended for v1)
No backend changes required. Fetch all matching records in memory, then serialise to CSV in the browser.

1. **UI**: Add an `<ExportButton>` (Ant Design or Refine's built-in) to the `<List>` header in `apps/web-next/src/pages/transactions/list.tsx`.

2. **Data fetch**: When the button is clicked, call `supabaseClient.from('transactions_with_details').select('*').eq('type', transactionType).eq(…all active filters…)` — mirror the current `useTable` filters. Use `.csv()` return type if PostgREST supports it (it does via `Accept: text/csv` header), or fetch JSON and convert.

3. **Conversion utility** `src/utility/exportCsv.ts`:
   - Accept `columns: { key: string; label: string }[]` and `rows: Record<string, unknown>[]`.
   - Produce a RFC 4180-compliant CSV string.
   - Trigger a browser download via a temporary `<a>` with `href = URL.createObjectURL(blob)`.

4. **Columns to include**: `date`, `type`, `amount`, `category_name`, `bank_account_name`, `tag_names` (joined with `;`), `notes`.

5. **Filename**: `moneylens-transactions-{type}-{YYYY-MM-DD}.csv`.

#### Option B — Server-side RPC (future)
A Supabase RPC `export_transactions_csv(p_type, p_start_date, p_end_date)` returning `text`. More useful once the dataset grows beyond a few thousand rows (avoids client memory). Not needed for v1.

### Risk / Complexity
**Low.** Client-side CSV is ~50 lines of utility code. The tricky part is correctly propagating the current `useTable` filters to the ad-hoc fetch — reading `filters` from `useTable` return value and building the Supabase query manually. Note that `tag_ids` uses an overlap filter (`cs` operator in PostgREST) which must be replicated correctly.

---

## 4. Bulk-Upload Downloadable JSON Template

### What
A "Download Template" button in the Settings → Bulk Upload section that provides a pre-filled sample JSON file the user can open, edit, and re-upload.

### Why
Currently users must infer the required JSON format from the `BulkUploadPayload` interface in the source code. The settings page says "Upload a JSON file containing categories, bank accounts, tags, and/or transactions" with no further guidance. A downloadable template eliminates this guesswork and dramatically reduces upload errors.

### How

#### Frontend only

1. **Static template object** — define a `BULK_UPLOAD_TEMPLATE` constant in `src/pages/settings/index.tsx` (or a shared constants file):

   ```ts
   const BULK_UPLOAD_TEMPLATE = {
     categories: [{ type: "spend", name: "Groceries", description: "Food shopping" }],
     bank_accounts: [{ name: "Current Account", description: "Main bank" }],
     tags: [{ name: "essential", description: "Essential expenses" }],
     transactions: [{
       date: "2026-01-15",
       type: "spend",
       amount: 42.50,
       category: "Groceries",
       bank_account: "Current Account",
       tags: ["essential"],
       notes: "Weekly shop"
     }]
   };
   ```

2. **Download handler** — `JSON.stringify(template, null, 2)` → `Blob` → `URL.createObjectURL` → trigger `<a download="moneylens-template.json">`.

3. **UI** — add a `<Button icon={<DownloadOutlined />}>Download Template</Button>` in `BulkUploadSection`, next to the existing upload button. Also update the `<Paragraph>` description to mention the template.

### Risk / Complexity
**Low.** Pure frontend, ~20 lines. Zero backend dependency.

---

## 5. User Profile Page

### What
A `/profile` page where users can view and edit:
- Display name
- Avatar (initials-based, no file upload needed for v1)
- Currency preference (moved here from Settings, or mirrored)
- Date format preference

### Why
There is no surface in the app that shows "who is logged in" beyond the avatar/email in the header. Users frequently want to change their display name or manage basic preferences in a dedicated place. This also surfaces the `date_format` setting introduced in Feature #1.

### How

#### Backend

- Depends on Feature #1 (`user_settings` table) for `currency` and `date_format`.
- Display name and avatar are stored in `auth.users.raw_user_meta_data` via Supabase Auth's `updateUser({ data: { full_name, avatar_initials } })` API — no additional table needed.

#### Frontend

1. **New page** `src/pages/profile/index.tsx` — an Ant Design `<Form>` with:
   - **Full Name** (`Input`) — read/write via `supabaseClient.auth.updateUser({ data: { full_name } })`
   - **Currency** (`Select` — reuse `SUPPORTED_CURRENCIES`) — write via `setCurrency` from `useCurrency()`; persisted via Feature #1
   - **Date Format** (`Select` — `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`) — read/write via `user_settings`

2. **Route** — add `/profile` to `App.tsx`:
   ```tsx
   <Route path="profile" element={<ProfilePage />} />
   ```
   Register a resource or just a route (no sidebar entry needed unless desired).

3. **Header link** — the existing `<Header>` component likely shows an avatar/email dropdown; add a "Profile" menu item linking to `/profile`.

4. **Date format context** — introduce a `DateFormatContext` (similar to `CurrencyContext`) so all `<DateField>` renders respect the user's preference. Wire it to `user_settings.date_format`.

### Risk / Complexity
**Medium.** Depends on Feature #1. The main complexity is the `DateFormatContext` propagation — `DateField` is used in multiple list pages and the transactions list. Must also handle the loading state while `user_settings` is fetched.

---

## 6. Bank Account Running Balance

### What
Each bank account page shows a **running balance** computed from transactions: `initial_balance + sum(earn) - sum(spend) - sum(save)`. A new `initial_balance` field on `bank_accounts` allows users to enter their real opening balance.

### Why
Bank accounts currently show only a name. Users expect to see their current balance at a glance — this is a core personal-finance feature and the absence makes the Bank Accounts section feel decorative.

### How

#### Backend

1. **Migration** — add `initial_balance NUMERIC(12,2) NOT NULL DEFAULT 0` to `bank_accounts`.

2. **View or RPC `get_bank_account_balances()`**:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_bank_account_balances()
   RETURNS TABLE (
     id UUID, name TEXT, description TEXT,
     initial_balance NUMERIC, current_balance NUMERIC,
     transaction_count BIGINT
   )
   LANGUAGE sql SECURITY INVOKER SET search_path = ''
   AS $$
     SELECT
       ba.id, ba.name, ba.description, ba.initial_balance,
       ba.initial_balance
         + COALESCE(SUM(
             CASE tx.type
               WHEN 'earn' THEN  tx.amount
               WHEN 'spend' THEN -tx.amount
               WHEN 'save'  THEN -tx.amount
               ELSE 0
             END
           ), 0) AS current_balance,
       COUNT(tx.id) AS transaction_count
     FROM public.bank_accounts ba
     LEFT JOIN public.transactions tx
       ON tx.bank_account_id = ba.id
      AND tx.deleted_at IS NULL
      AND tx.user_id = auth.uid()
     WHERE ba.user_id = auth.uid()
     GROUP BY ba.id, ba.name, ba.description, ba.initial_balance;
   $$;
   ```
   Grant `EXECUTE` to `authenticated`.

3. Alternatively expose this as a materialized view (`bank_accounts_with_balance`) with `security_invoker = TRUE` — refresh on transaction insert/update/delete via trigger. This is more complex but cheaper for large datasets. For v1, the RPC is simpler.

#### Frontend

1. **`BankAccountList`** — call `supabaseClient.rpc('get_bank_account_balances')` and replace the bare list with columns: Name, Description, Initial Balance, Current Balance, Transaction Count.

2. **`BankAccountCreate` / `BankAccountEdit`** — add an `Initial Balance` `<InputNumber>` field (default 0).

3. **`BankAccountShow`** — display the current balance prominently (e.g., Ant Design `<Statistic>`).

4. **Dashboard** — optionally add a "Net Worth" summary card = sum of all account current balances.

5. **Update `types.gen.ts`** after migration.

### Risk / Complexity
**Medium.** The balance calculation is straightforward SQL. Complexity comes from: (a) the `initial_balance` migration and associated form changes, (b) keeping the balance live when transactions are mutated — using Refine's invalidation or Supabase Realtime. For v1, a manual refresh/invalidation on the bank account page is acceptable.

---

## 7. Budget Trajectory Projection

### What
On the Budget Show/List page, display a "at this rate you will exceed the budget on approximately **\<date\>**" (or "you are on track to reach X% by the end date") projection.

### Why
The current `get_budget_progress()` RPC returns `current_amount` vs `target_amount`, but gives no time-based insight. Users cannot tell if they are pacing well or about to overspend. This converts the budget from a static progress bar into an actionable planning tool.

### How

#### Backend

Extend `get_budget_progress()` (or create a new `get_budget_trajectory()` RPC) to return additional fields:

```sql
-- Days elapsed / days total
days_elapsed    INT,
days_total      INT,
-- Linear projection: current_amount / days_elapsed * days_total
projected_total NUMERIC,
-- Date when projected spend will cross target_amount (NULL if on track)
projected_exceed_date DATE
```

Calculation logic (in SQL or delegated to frontend):
- `days_elapsed = CURRENT_DATE - start_date` (floor at 1 to avoid division by zero).
- `daily_rate = current_amount / days_elapsed`.
- `days_to_exceed = (target_amount - current_amount) / daily_rate` (NULL if `daily_rate = 0`).
- `projected_exceed_date = CURRENT_DATE + days_to_exceed::INT`.

#### Frontend

1. **`BudgetShow` page** — add an Ant Design `<Alert>` or `<Statistic>` below the progress bar:
   - 🟢 "On track — projected to reach X% by {end_date}" (if `projected_total ≤ target_amount`)
   - 🔴 "At this rate you will exceed the budget around **{projected_exceed_date}**"

2. **`BudgetList`** — add a small inline badge (e.g., a red warning icon) on budgets where `projected_exceed_date` is in the near future (< 7 days).

3. **No new route needed** — enhancement to existing pages.

### Risk / Complexity
**Medium.** The maths is simple but edge cases require care: budgets with no `start_date`/`end_date`, budgets with zero `current_amount` (no projection possible), and budgets with very short remaining windows. The projection is linear (assumes constant spending rate), which is a stated simplification.

---

## 8. Recurring Transaction Support

### What
Allow users to mark a transaction as **recurring** (weekly, monthly, etc.) and surface upcoming/scheduled bills in a dedicated dashboard section.

### Why
Most personal finance apps treat recurring bills (rent, subscriptions) as first-class entities. Without this, MoneyLens requires manual re-entry each period and provides no forward visibility into upcoming obligations.

### How

#### Backend

1. **New `recurring_transactions` table**:
   ```sql
   CREATE TABLE public.recurring_transactions (
     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     name          TEXT NOT NULL,
     type          transaction_type NOT NULL,
     amount        NUMERIC(12,2) NOT NULL,
     category_id   UUID REFERENCES public.categories(id),
     bank_account_id UUID REFERENCES public.bank_accounts(id),
     frequency     TEXT NOT NULL CHECK (frequency IN ('daily','weekly','fortnightly','monthly','yearly')),
     start_date    DATE NOT NULL,
     end_date      DATE,            -- NULL = indefinite
     last_applied  DATE,            -- set when an actual transaction is generated
     notes         TEXT,
     deleted_at    TIMESTAMPTZ DEFAULT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

2. **RLS** — owner-only policies (same pattern as other tables).

3. **`get_upcoming_recurring(p_horizon_days INT DEFAULT 30)`** RPC:
   - Returns the next occurrence date for each active recurring transaction within the horizon.
   - Logic: `next_date = last_applied + interval_for(frequency)`, filter to those ≤ `CURRENT_DATE + p_horizon_days`.

4. **Generation strategy** — two options:
   - **Manual ("mark as paid")**: User sees upcoming items in a dashboard widget and taps "Record" to create the actual transaction. Simplest to implement.
   - **Automatic (Supabase Edge Function cron)**: A scheduled function runs daily, inserts transactions for overdue recurring items. More powerful but requires a Deno Edge Function and `pg_cron`.
   - **Recommendation for v1**: Manual generation — lower risk, no cron infrastructure.

#### Frontend

1. **New resource** `recurring_transactions` in `App.tsx` with List / Create / Edit routes.

2. **`RecurringTransactionList`** — standard Refine list with columns: Name, Amount, Frequency, Next Due, Category, Bank Account.

3. **`RecurringTransactionCreate/Edit`** — form with Amount, Type, Category, Frequency (Select), Start Date, End Date (optional), Notes. Reuse the same field patterns as `TransactionCreate`.

4. **Dashboard widget** "Upcoming Bills" — calls `get_upcoming_recurring()`, renders a list of next-30-days items with an inline "Record" button that pre-fills `TransactionCreate` with the recurring transaction's values.

5. **Sidebar entry** — add "Recurring" nav item in `App.tsx` resources (with a `CalendarOutlined` icon).

### Risk / Complexity
**High.** This is the most architecturally new feature — it introduces a new table, new RPC, a new resource with full CRUD, and a dashboard widget. The "manual generation" approach keeps it manageable. Estimate 3–5 days of focused development. Dependencies: none technically, but `user_settings` (Feature #1) should be done first to ensure a solid foundation.

---

## Dependency Graph

```
Feature #1 (user_settings)
    └── Feature #5 (profile page / date format)

Feature #6 (bank balance)   — independent
Feature #3 (CSV export)     — independent
Feature #4 (JSON template)  — independent
Feature #2 (KBar)           — independent
Feature #7 (trajectory)     — independent (extends existing budgets)
Feature #8 (recurring)      — independent (new table/resource)
```

---

## Implementation Order (Recommended)

| Sprint | Features | Rationale |
|--------|----------|-----------|
| Sprint 1 | #4 (JSON template), #2 (KBar), #3 (CSV export) | All low complexity, high value, zero backend risk. Ship fast wins first. |
| Sprint 2 | #1 (user_settings + currency persistence) | Backend foundation; unblocks Feature #5. |
| Sprint 3 | #5 (profile page) | Builds on #1. |
| Sprint 4 | #6 (bank balance) | Self-contained backend + UI work. |
| Sprint 5 | #7 (budget trajectory) | Extends existing budget infrastructure; low risk. |
| Sprint 6 | #8 (recurring transactions) | Highest complexity; saved for last. |

---

## Testing Checklist (per feature)

- [ ] **#1** — `supabase test db` pgTAP tests for `get_or_create_user_settings()` RLS enforcement; E2E: change currency on device A, verify it appears on device B after re-login.
- [ ] **#2** — E2E: press `Cmd+K`, type "transaction", confirm navigation to `/transactions/create`.
- [ ] **#3** — Unit test CSV utility (delimiter escaping, tag joining); E2E: apply date filter + export, verify CSV row count matches table.
- [ ] **#4** — Manual: click Download Template, open file, verify all keys present and valid JSON.
- [ ] **#5** — E2E: update display name, reload, verify name persists in header.
- [ ] **#6** — pgTAP: `get_bank_account_balances()` with known fixture data; E2E: create earn/spend transactions, verify balance updates.
- [ ] **#7** — Unit test projection formula (edge cases: zero spending, no start date); E2E: create budget with known amount and date, verify trajectory label.
- [ ] **#8** — pgTAP: `get_upcoming_recurring()` returns correct next dates for each frequency; E2E: create recurring, verify dashboard widget shows it within 30 days.

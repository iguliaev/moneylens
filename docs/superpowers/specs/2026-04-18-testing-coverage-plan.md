# Testing Coverage Improvement Plan

**Date:** 2026-04-18  
**Status:** Draft

---

## Overview

MoneyLens has solid E2E coverage for CRUD operations and strong pgTAP coverage for RLS and aggregation views, but has critical gaps in four areas: zero unit tests (no Vitest), no component tests, a near-empty dashboard E2E, and no pgTAP coverage for the budget feature. This plan prioritises each gap by risk and implementation cost.

---

## 1. Unit Tests (Vitest)

**Current state:** Vitest is not installed. No unit tests exist.

### 1.1 Setup

**What:** Install and configure Vitest with a minimal `vitest.config.ts` alongside the existing Vite config. Add a `test:unit` script to `package.json`. No DOM environment is needed for pure-function tests; use `environment: 'node'` initially. Add `@vitest/coverage-v8` for coverage reports.

**Why:** Unit tests are the fastest safety net. Without them, regressions in utility logic only surface in expensive E2E runs — or not at all.

**How:**
- `npm install -D vitest @vitest/coverage-v8` inside `apps/web-next/`
- Create `apps/web-next/vitest.config.ts` extending the Vite config
- Add scripts: `"test:unit": "vitest run"` and `"test:unit:watch": "vitest"`

**Complexity:** Low (setup only)

---

### 1.2 `formatAmount` and `formatCurrency` — `src/utility/currency.ts`

**What to test:**

| Test case | Input | Expected output |
|-----------|-------|-----------------|
| Integer number | `100` | `"100.00"` |
| Float string | `"1.015"` | `"1.02"` (banker's rounding awareness) |
| Negative amount | `-50` | `"-50.00"` |
| Zero | `0` | `"0.00"` |
| `formatCurrency` default USD | `1234.56` | `"$1,234.56"` |
| `formatCurrency` explicit EUR | `9.99, "EUR"` | `"€9.99"` |
| `formatCurrency` with string input | `"500"` | `"$500.00"` |
| Large number formatting | `1000000` | `"$1,000,000.00"` |

**Why:** `formatAmount` is the display layer for every transaction amount in the UI. A silent regression (e.g., rounding changes) would corrupt all displayed figures. `formatCurrency` drives the currency selector context across the whole app.

**How:** `apps/web-next/src/utility/__tests__/currency.test.ts`. No mocks needed — pure functions.

**Complexity:** Low

---

### 1.3 `withSoftDelete` — `src/utility/softDeleteDataProvider.ts`

**What to test:**

| Test case | Description |
|-----------|-------------|
| Soft-deletable resource | Calling `deleteOne` for `transactions` should call `supabaseClient.from(...).update({ deleted_at: ... })`, NOT the underlying provider's `deleteOne` |
| Non-soft-deletable resource | Calling `deleteOne` for a resource not in `SOFT_DELETE_RESOURCES` (e.g., `"profiles"`) should delegate to the original provider unchanged |
| All five soft-delete resources | Verify `transactions`, `categories`, `bank_accounts`, `tags`, `budgets` are all intercepted |
| Error propagation | When supabaseClient returns `{ error }`, the function should `Promise.reject` that error |
| Other provider methods pass-through | `getList`, `getOne`, `create`, `update` are delegated unchanged to the wrapped provider |
| `deleted_at` is valid ISO string | The value set on `deleted_at` must parse as a valid `Date` |

**Why:** The soft-delete provider is the central mechanism that prevents permanent data loss. If it silently hard-deletes, data is gone. If it doesn't intercept the right resources, users see deleted records.

**How:** `apps/web-next/src/utility/__tests__/softDeleteDataProvider.test.ts`. Mock the Supabase client with a spy object:

```
const mockFrom = { update: vi.fn(() => ({ eq: ... })) }
const mockClient = { from: vi.fn(() => mockFrom) }
const mockProvider = { deleteOne: vi.fn(), getList: vi.fn(), ... }
```

Use `vi.fn()` to assert call args and return values. No network needed.

**Complexity:** Medium (mock chain for Supabase fluent API)

---

### 1.4 `getMonthKeysInRange` — `src/pages/dashboard/ChartsTab.tsx`

**Current state:** The function is defined inline and not exported.

**What:** Extract `getMonthKeysInRange(startDate, endDate): string[]` to a separate module (`src/utility/dateHelpers.ts`) and export it. Then test:

| Test case | Input | Expected |
|-----------|-------|----------|
| Single month range | `"2025-01-01"`, `"2025-01-31"` | `["2025-01"]` |
| Multi-month range | `"2025-01-01"`, `"2025-03-15"` | `["2025-01", "2025-02", "2025-03"]` |
| Cross-year range | `"2024-11-01"`, `"2025-02-01"` | `["2024-11", "2024-12", "2025-01", "2025-02"]` |
| Start equals end | `"2025-06-15"`, `"2025-06-20"` | `["2025-06"]` |
| End before start | Should return `[]` or throw — document and enforce the contract |

**Why:** `getMonthKeysInRange` controls which X-axis buckets are generated for charts. A bug here makes chart series misaligned, which is visually catastrophic and very hard to debug without a unit test.

**How:** `apps/web-next/src/utility/__tests__/dateHelpers.test.ts`. Pure function; no mocks.

**Complexity:** Low (after extraction refactor)

---

### 1.5 `slugify` — `e2e/utils/test-helpers.ts`

**What:** The local `slugify` implementation in test-helpers is used to construct Playwright `data-testid` locators for tag options. If it diverges from the production slug logic, tests silently pass the wrong elements.

| Test case | Input | Expected |
|-----------|-------|----------|
| Simple lowercase | `"groceries"` | `"groceries"` |
| With spaces | `"My Tag"` | `"my-tag"` |
| With special chars | `"food & drink"` | `"food-drink"` |
| Leading/trailing spaces | `" hello "` | `"hello"` |
| Multiple dashes | `"a--b"` | `"a-b"` |

**Why:** Tag option locators in `selectTags()` rely on this. A divergence between test slug and production slug causes false passes (selecting wrong element) or false failures.

**How:** `apps/web-next/e2e/utils/__tests__/slugify.test.ts`. No mocks needed. Consider also testing the production slug (if it exists) and asserting they produce the same output.

**Complexity:** Low

---

## 2. Component Tests

**Current state:** No component tests exist. Vitest + jsdom (or @testing-library/react) would be needed.

### 2.1 Setup

**What:** Extend the Vitest config with `environment: 'jsdom'`. Install `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom`. Configure a `setupTests.ts` file. This is a separate concern from unit tests; use a different test glob pattern (e.g., `**/*.component.test.tsx`).

**Why:** Component tests catch form validation bugs, conditional rendering regressions, and UI state bugs much faster than E2E tests, without requiring a full browser or live database.

**Complexity:** Medium (new tooling; Ant Design + Refine need careful provider mocking)

---

### 2.2 Transaction Form Validation

**What:** Test the Create Transaction form in isolation:

| Test case | Scenario |
|-----------|----------|
| Required field — amount | Submit with empty amount → error message appears |
| Required field — type | Submit without selecting type → error message appears |
| Required field — category | Submit without category → error message appears |
| Required field — date | Submit without date → error message appears |
| Valid submission | All fields filled → `onFinish` callback called with correct shape |
| Amount > 0 | Submit with `0` or negative → error message appears |
| Notes optional | Submit without notes → no error |

**Why:** Form validation is easy to break silently. A type-mismatch bug (e.g., `amount` sent as string instead of number) only shows up as a Supabase insert error, not a visible UI bug — and E2E tests may mask it with pre-seeded data.

**How:** `apps/web-next/src/pages/transactions/__tests__/TransactionForm.component.test.tsx`. Wrap the form with minimal Refine and Ant Design providers. Mock `useSelect` hooks (categories, bank accounts) to return fixture data. Assert on validation messages using `@testing-library/react`.

**Complexity:** High (provider setup, Refine hooks mocking)

---

### 2.3 Budget Progress Display

**What:** Test the budget card/progress bar component:

| Test case | Scenario |
|-----------|----------|
| 0% progress | `current_amount = 0`, `target_amount = 500` → progress bar at 0% |
| 50% progress | `current_amount = 250`, `target_amount = 500` → 50% shown |
| 100% progress | `current_amount = 500`, `target_amount = 500` → 100%, no overflow shown |
| Over-budget | `current_amount = 600`, `target_amount = 500` → capped or highlighted |
| Zero target guard | `target_amount = 0` → no division-by-zero crash |
| Currency formatting | Amounts displayed using `formatCurrency` not raw numbers |

**Why:** Budget progress is the primary user-facing output of `get_budget_progress()`. A display bug (wrong percentage, broken overflow) misleads users about their financial health.

**How:** `apps/web-next/src/pages/budgets/__tests__/BudgetCard.component.test.tsx`. Pass fixture props; no Supabase or Refine needed if the component accepts plain props.

**Complexity:** Medium

---

### 2.4 Transaction Filters

**What:** Test the filter panel UI state (segmented control, date range, amount range):

| Test case | Scenario |
|-----------|----------|
| Type filter switches tab | Click "Spend" → `type=spend` passed to data query |
| Amount min/max filtering | Enter min=100, max=500 → filter applied in URL/state |
| Clear filters | Click reset → all filters cleared |
| Filter persistence | Filters survive a re-render (URL params) |

**Why:** Filters are not currently tested anywhere. A regression in filter state (e.g., filter not cleared on tab switch) would cause wrong data to show silently.

**How:** `apps/web-next/src/pages/transactions/__tests__/TransactionFilters.component.test.tsx`. Mock the router context to assert URL param changes.

**Complexity:** Medium

---

## 3. E2E Tests (Playwright)

### 3.1 Dashboard — Data Rendering

**File:** `apps/web-next/e2e/tests/dashboard.spec.ts` (expand existing file)

**Current state:** 3 assertions that check headings exist. No data validation.

**What to add:**

| Test case | Scenario |
|-----------|----------|
| Summary tab shows correct totals | Seed known transactions (earn $500, spend $100, save $200 this month); assert the dashboard Summary tab displays those exact amounts |
| Top Tags panel | Seed a transaction tagged "essentials" → assert "essentials" appears in the Top Tags panel with the correct amount |
| Empty state | Fresh user with no transactions → assert "no data" / empty state messages are shown (not blank/error) |
| Charts tab — data present | Seed transactions, open Charts tab, assert chart bars/lines are rendered (not blank SVGs) |
| Charts tab — year selector | Change year selector → chart updates without crash |
| Navigation between Summary and Charts | Switch tabs without page reload; assert no blank screens |

**Why:** The dashboard is the first screen users see. A regression in data rendering has maximum visibility. The current test would pass even if all chart data was missing.

**How:** Use existing `seedReferenceDataForUser` + `seedTransactionsForUser` helpers. Use `waitForSelector` on specific amount text. Assert Recharts SVG elements have non-zero dimensions.

**Complexity:** Medium

---

### 3.2 Transaction Filters E2E

**File:** `apps/web-next/e2e/tests/transactions.spec.ts` (new `describe` block) or a new `transaction-filters.spec.ts`

**What to add:**

| Test case | Scenario |
|-----------|----------|
| Type filter — spend tab | Seed spend + earn transactions; click "Spend" tab; only spend transactions visible |
| Type filter — earn tab | Same setup; click "Earn" tab; only earn transactions visible |
| Type filter — all tab | After filtering, select "All"; both visible again |
| Amount filter — min | Enter min=400; only transactions ≥ 400 shown |
| Amount filter — max | Enter max=150; only transactions ≤ 150 shown |
| Amount filter — range | Min=100, max=200; only matching transactions shown |
| Date range filter | Select a date range; only transactions within range visible |
| Tag filter | Filter by tag "essentials"; only tagged transactions visible |
| Clear filters | After applying filter, clear → all transactions restored |
| Empty result | Apply filter that matches nothing → empty state shown (no JS error) |

**Why:** Filters are not tested anywhere. A broken filter silently shows wrong data — a critical finance app regression that could lead to incorrect financial decisions.

**How:** Seed 3–4 transactions with distinct amounts and types using `supabaseAdmin` directly. Use `page.getByRole("spinbutton")` for amount inputs, `page.getByRole("radiogroup")` for type segmented control. Assert row counts with `page.locator("tr[data-row-key]").count()`.

**Complexity:** Medium

---

### 3.3 Budget Progress E2E

**File:** `apps/web-next/e2e/tests/budgets.spec.ts` (new `describe` block)

**What to add:**

| Test case | Scenario |
|-----------|----------|
| Budget shows 0 progress | Create budget with no matching transactions → progress = 0% / $0 |
| Budget reflects transactions | Create spend budget for "Groceries"; add a $100 spend transaction in Groceries → budget shows $100 progress |
| Budget with category link | Budget linked to category "Salary"; earn $500 → progress updates |
| Budget with tag link | Budget linked to tag "essentials"; add tagged spend → progress updates |
| No double-counting | Transaction matches both category and tag link → counted once, not twice |
| Over-budget display | Spend $600 against a $500 budget → UI shows correct amount and "over budget" state |
| Date-bounded budget | Budget with `start_date`/`end_date`; transactions outside range not counted |

**Why:** `get_budget_progress()` has UNION deduplication logic that is complex and untested end-to-end. The "counted once" invariant must be verified through the UI to confirm the RPC, view, and display all work together.

**How:** Seed data using `supabaseAdmin`, then navigate to `/budgets` and assert displayed amounts. Requires creating transactions and budgets via the API, then checking UI-rendered progress values.

**Complexity:** High (multi-entity setup, deduplication verification)

---

### 3.4 Soft Delete Isolation E2E

**File:** `apps/web-next/e2e/tests/transactions.spec.ts` or `soft-delete.spec.ts`

**What to add:**

| Test case | Scenario |
|-----------|----------|
| Deleted transaction not visible | Delete a transaction in the UI → it disappears from the list |
| Deleted transaction excluded from totals | Dashboard totals do not include soft-deleted transaction amounts |
| Deleted category not in dropdowns | Soft-delete a category → it no longer appears in the transaction create form dropdown |
| Deleted tag not in tag selector | Soft-delete a tag → not available when creating/editing transactions |
| Deleted budget not in budget list | Soft-delete a budget → disappears from budget list |

**Why:** Soft-delete is the central data protection mechanism. There is currently no E2E test verifying that deleted records are truly excluded from all UI surfaces. A regression (e.g., missing `deleted_at IS NULL` filter) would show deleted data as active.

**How:** Use existing CRUD helpers to create then delete records. Assert absence in lists and absence from aggregate totals.

**Complexity:** Medium

---

## 4. pgTAP Tests (Supabase)

### 4.1 `get_budget_progress()` — Core Logic

**File:** `supabase/tests/budget_progress_test.sql` (new file)

**What to test:**

| Test case | Description |
|-----------|-------------|
| Empty budget | Budget with no linked categories or tags → `current_amount = 0` |
| Category match | Budget linked to "food" category; matching spend transaction → correct sum |
| Tag match | Budget linked to "essentials" tag; matching tagged spend → correct sum |
| Both category and tag match (UNION dedup) | Same transaction matches via both a linked category AND a linked tag → counted exactly once (not doubled) |
| Multiple transactions | 3 matching transactions → sum of all 3 |
| Type filter | Spend budget does not count earn transactions with same category |
| Date range — inside | Transaction within `start_date`/`end_date` → counted |
| Date range — before start | Transaction before `start_date` → excluded |
| Date range — after end | Transaction after `end_date` → excluded |
| Null date range | `start_date IS NULL AND end_date IS NULL` → all-time transactions counted |
| Soft-deleted transaction excluded | Transaction with `deleted_at` set → not counted |
| Soft-deleted budget excluded | Budget with `deleted_at` set → not returned by function |
| Soft-deleted category link | `budget_categories` entry links to a soft-deleted category → transaction not counted |
| Cross-user isolation | User 2's transactions should not appear in User 1's budget progress |
| Multiple budgets | Two budgets for same user → each returns its own independent total |
| COALESCE zero | Budget with transactions returns `current_amount > 0`; budget without returns exactly `0`, not `NULL` |

**Why:** `get_budget_progress()` is the most algorithmically complex SQL in the codebase. Its UNION deduplication logic exists precisely to prevent double-counting — a subtle bug that would make budgets appear "used up" faster than they should be. No test currently exercises this logic.

**How:** Follow the pattern in `aggregation_logic_test.sql`. Use `tests.create_supabase_user`, `tests.authenticate_as`, `tests.get_supabase_uid`. Wrap in `BEGIN`/`ROLLBACK`. Use `results_eq` and `is` assertions. Seed categories, tags, budgets, `budget_categories`, `budget_tags`, and transactions explicitly for each scenario.

**Complexity:** High (many scenarios, complex setup, deduplication assertion requires careful data design)

---

### 4.2 `budgets` Table — RLS

**File:** `supabase/tests/budgets_rls_test.sql` (new file)

**What to test:**

| Test case | Description |
|-----------|-------------|
| SELECT isolation | User 1 cannot see User 2's budgets |
| INSERT own budget | User 1 can insert a budget for themselves |
| INSERT other user | User 1 cannot insert a budget with `user_id = user2` (RLS violation) |
| UPDATE own budget | User 1 can update their own budget |
| UPDATE other user's budget | User 1 update to User 2's budget is a no-op (RLS blocks) |
| DELETE own budget | User 1 can delete (hard-delete) their own budget |
| DELETE other user's budget | User 1 delete targeting User 2 is blocked |
| `budget_categories` isolation | User 1 cannot select/insert `budget_categories` rows for User 2's budgets |
| `budget_tags` isolation | User 1 cannot select/insert `budget_tags` rows for User 2's budgets |
| `budget_categories` cross-user category | Cannot link User 2's category to User 1's budget |
| `budget_tags` cross-user tag | Cannot link User 2's tag to User 1's budget |

**Why:** Budgets contain sensitive financial targets. An RLS misconfiguration could expose one user's financial goals to another. The junction tables (`budget_categories`, `budget_tags`) have their own RLS policies that need independent verification.

**How:** Follow `bank_accounts_rls_test.sql` pattern. Two test users; authenticate as each; assert counts and exception codes.

**Complexity:** Medium

---

### 4.3 `budgets_with_linked` View

**File:** `supabase/tests/budgets_rls_test.sql` (add to same file) or `budget_progress_test.sql`

**What to test:**

| Test case | Description |
|-----------|-------------|
| `category_count` correct | Budget with 2 linked categories → `category_count = 2` |
| `tag_count` correct | Budget with 3 linked tags → `tag_count = 3` |
| Soft-deleted category not counted | Link to a soft-deleted category → not included in `category_count` |
| Soft-deleted tag not counted | Link to a soft-deleted tag → not included in `tag_count` |
| Soft-deleted budget excluded | Budget with `deleted_at` set → not returned by view |
| Zero counts | Budget with no links → `category_count = 0`, `tag_count = 0` |

**Why:** The budgets list page uses `budgets_with_linked` to show counts. If soft-deleted categories/tags are incorrectly counted, users see inflated link counts for their budgets.

**How:** Seed budgets + categories + tags + junction records. Soft-delete some. Assert view output with `results_eq`.

**Complexity:** Low–Medium

---

## 5. Priority Matrix

| # | Test | Risk if Missing | Effort | Priority |
|---|------|----------------|--------|----------|
| 1 | pgTAP `get_budget_progress()` | Double-counted budget amounts (financial data bug) | High | **P0** |
| 2 | pgTAP `budgets` RLS | Financial goal data leakage between users | Medium | **P0** |
| 3 | Unit: `withSoftDelete` | Hard-deletes data instead of soft-deleting | Medium | **P1** |
| 4 | E2E: Transaction filters | Wrong data displayed silently | Medium | **P1** |
| 5 | E2E: Dashboard data rendering | No confidence dashboard reflects real data | Medium | **P1** |
| 6 | E2E: Budget progress display | Deduplication bug reaches production undetected | High | **P1** |
| 7 | Unit: `formatAmount` / `formatCurrency` | Silent rounding/formatting regressions | Low | **P2** |
| 8 | Unit: `getMonthKeysInRange` | Misaligned chart X-axis buckets | Low | **P2** |
| 9 | pgTAP `budgets_with_linked` | Incorrect link counts in budget list | Low | **P2** |
| 10 | Component: Transaction form validation | Invalid data submitted silently | Medium | **P2** |
| 11 | E2E: Soft delete isolation | Deleted records resurface in UI | Medium | **P2** |
| 12 | Component: Budget progress display | Display bug in financial progress bar | Low | **P3** |
| 13 | Component: Transaction filters | Filter state regressions | Low | **P3** |
| 14 | Unit: `slugify` in test helpers | Test selects wrong DOM element | Low | **P3** |

---

## 6. Implementation Order

1. **Week 1** — pgTAP gaps (no new tooling, highest ROI)
   - `budgets_rls_test.sql`
   - `budget_progress_test.sql` (deduplication + date range + cross-user)
   - Add `budgets_with_linked` assertions to budget test file

2. **Week 2** — Vitest setup + unit tests
   - Install Vitest, configure
   - `currency.test.ts`, `softDeleteDataProvider.test.ts`
   - Extract and test `getMonthKeysInRange` → `dateHelpers.test.ts`

3. **Week 3** — E2E gaps
   - Expand `dashboard.spec.ts` with data assertions
   - Add filter tests to `transactions.spec.ts`
   - Add budget progress tests to `budgets.spec.ts`

4. **Week 4** — Component tests (if Vitest+jsdom proves low friction)
   - Provider/mock setup
   - Transaction form validation
   - Budget progress card

---

## 7. Notes & Constraints

- **No Vitest installed**: `package.json` has no `vitest` dependency. Unit and component tests require installing it before any tests can run.
- **`getMonthKeysInRange` refactor needed**: The function must be extracted from `ChartsTab.tsx` and exported to be testable without mounting the full component.
- **Ant Design + Refine mocking is non-trivial**: Component tests for form pages will require wrapping with `<Refine>`, `<ConfigProvider>`, and mocked data providers. Plan extra time for initial setup.
- **`view_monthly_tagged_type_totals` is already tested**: Tests 9 and 10 in `aggregation_logic_test.sql` cover this view — it was listed as a gap but is actually covered.
- **E2E deduplication test design**: To prove UNION dedup works end-to-end, create a transaction whose `category_id` matches a budget's category link AND whose tag matches the budget's tag link. Assert `current_amount` equals the transaction amount once, not twice.

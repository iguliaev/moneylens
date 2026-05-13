# E2E Failure Stabilization Plan (dashboard-month-range + transactions)

## Problem statement
`npm run test:e2e:ci` currently fails with 5 timeouts. All failures are blocked on `page.waitForLoadState("networkidle")` (30s timeout), primarily in `e2e/tests/transactions.spec.ts` plus one in `e2e/tests/dashboard-month-range.spec.ts`.

## Current state summary
- `waitForFormReady()` in `apps/web-next/e2e/utils/test-helpers.ts` only waits for `aria-busy="false"` on edit forms.
- Failing tests add an extra `networkidle` wait after form readiness / tab switches.
- The non-failing edit tests (`categories`, `tags`, `bank-accounts`) rely on `waitForFormReady()` and do **not** use `networkidle`.
- Chart tests depend on async loading from `useChartsData(...)`, but `networkidle` is a weak signal for readiness in this app.

## Proposed approach
Replace brittle global-idle waits with deterministic, user-visible readiness checks in the failing tests. Keep scope focused on e2e test reliability first; only touch app code if a deterministic test-only fix is not possible.

## Plan tasks

### 1) Use Playwright CLI to inspect failing UI transitions before refactor
- **Tools:** `playwright-cli` (or `npx playwright-cli` fallback)
- Reproduce failing flows interactively (transactions edit + dashboard charts tab) and inspect:
  - whether dropdown overlays detach/re-render during interactions
  - whether chart area has stable UI readiness signals
  - whether network-idle is misleading versus actual user-visible readiness
- Capture findings to drive helper/assertion choices in test refactor steps.

### 2) Add deterministic wait helpers for transactions/dashboard flows
- **Files:** `apps/web-next/e2e/utils/test-helpers.ts`
- Add helpers that wait on UI state relevant to each flow (form ready + expected controls/values visible, or chart/loading-state transitions) instead of page-level `networkidle`.
- Keep helpers composable so multiple transaction tests can reuse the same synchronization points.

### 3) Refactor failing transaction edit/tag/category tests to use helper-based waits
- **Files:** `apps/web-next/e2e/tests/transactions.spec.ts`
- Replace failing `networkidle` calls (edit flow, tag update flow, category-by-type flow) with helper waits.
- While editing these blocks, align Ant Design Select interactions to visible dropdown-scoped selection where needed to reduce detached-element flakes.

### 4) Refactor dashboard month-range invalid-state test to avoid `networkidle`
- **Files:** `apps/web-next/e2e/tests/dashboard-month-range.spec.ts`
- Remove initial `networkidle` wait on Charts tab open.
- Use explicit assertions for “chart rendered / loading complete / warning visible” and preserve existing network-request suppression assertion semantics.

### 5) Validate with targeted reruns, then full suite
- **Commands:**  
  - (Optional, for diagnosis while refactoring) `playwright-cli` session commands to verify element visibility/locators in the live app
  - `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/dashboard-month-range.spec.ts`  
  - `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/transactions.spec.ts`  
  - `cd apps/web-next && npm run test:e2e:ci`
- Confirm failing scenarios are stable and no regressions introduced.

## Notes / guardrails
- Prefer semantic Playwright locators (`getByRole`, `expect(...).toBeVisible`) and app-state assertions over timing/network heuristics.
- Scope is **test-only fixes first** (no production code changes unless explicitly re-approved later).
- Keep this effort scoped to the reported 5 failures; only broaden if reruns reveal tightly coupled flakes.

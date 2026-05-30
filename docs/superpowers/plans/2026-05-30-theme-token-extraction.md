# Theme Token Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize light/dark theme values into a shared token layer and move app-wide typography into the Vite/Ant Design shell without changing the product's visual identity.

**Architecture:** Keep Ant Design as the theme engine, but stop scattering color literals through page and component code. A shared token module will define semantic surface/text/border/status/chart values for both light and dark modes, and the existing `ConfigProvider` path will select the active theme. Global typography will be applied once at the app entry and inherited by React/Refine pages and AntD components.

**Tech Stack:** React 19, Vite, Ant Design 5, Refine, Recharts, Playwright, TypeScript.

---

### Task 1: Defining shared theme tokens and global typography

**Files:**
- Create: `apps/web-next/src/theme/tokens.ts`
- Create: `apps/web-next/src/styles/global.css`
- Modify: `apps/web-next/src/contexts/color-mode/index.tsx`
- Modify: `apps/web-next/src/index.tsx`
- Modify: `apps/web-next/index.html`

- [ ] **Step 1: Audit the current theme inputs**

Read the current light/dark wiring in `apps/web-next/src/contexts/color-mode/index.tsx`, the Vite entry in `apps/web-next/src/index.tsx`, and the HTML shell in `apps/web-next/index.html`. Confirm that Ant Design is currently using `RefineThemes.Blue` and that there is no global stylesheet imported yet.

- [ ] **Step 2: Create the shared token contract**

Add `apps/web-next/src/theme/tokens.ts` with semantic tokens for both themes. The module must expose:

- `SEMANTIC_COLORS`
- `CHART_SERIES_COLORS`
- tokenized semantic color exports consumed by features (for example, `TEXT_MUTED_COLOR`, `CHART_GRID_COLOR`, `DANGER_TEXT_COLOR`)
- `APP_FONT_FAMILY`
- `lightThemeConfig`
- `darkThemeConfig`
- `applyThemeMode()`

Keep the palette conservative: reuse the current blue/status intent, but centralize values behind semantic names rather than page-specific literals.

- [ ] **Step 3: Wire Ant Design to the shared token layer**

Update `apps/web-next/src/contexts/color-mode/index.tsx` so `ConfigProvider` consumes `lightThemeConfig`/`darkThemeConfig` from `src/theme/tokens.ts` instead of `RefineThemes.Blue`. Preserve the current `mode` state and localStorage behavior; only swap the theme source of truth.

- [ ] **Step 4: Add global typography and page baseline styles**

Create `apps/web-next/src/styles/global.css` and import it from `apps/web-next/src/index.tsx`. Set the base system font stack, color, and page background there so React/Refine pages inherit consistent typography. Update `apps/web-next/index.html` so the document theme-color metadata matches the active light/dark theme.

- [ ] **Step 5: Verify the app still compiles**

Run:

```bash
cd apps/web-next
npm run check-types
```

Expected: `tsc --noEmit` passes with no errors.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/web-next/src/theme/tokens.ts apps/web-next/src/styles/global.css apps/web-next/src/index.tsx apps/web-next/src/contexts/color-mode/index.tsx apps/web-next/index.html
git commit -m "feat(theme): add shared token layer and typography baseline"
```

### Task 2: Migrating dashboard color consumers to semantic tokens

**Files:**
- Modify: `apps/web-next/src/constants/transactionTypes.ts`
- Modify: `apps/web-next/src/pages/dashboard/components/TrendChart.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/TagBar.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/TrendBadge.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx`

- [ ] **Step 1: Replace hardcoded transaction colors at the constant layer**

Update `TYPE_VALUE_COLORS` in `apps/web-next/src/constants/transactionTypes.ts` to derive from the shared token module instead of the current hex literals. Keep `TRANSACTION_TYPES`, `TRANSACTION_TYPE_OPTIONS`, and `TRANSACTION_TYPE_LABELS` unchanged.

- [ ] **Step 2: Move chart grid and palette colors onto tokens**

Update the Recharts consumers so they pull from `chartPalette`, `borderSubtle`, or Ant Design token values instead of `#f0f0f0`, `#52c41a`, `#ff4d4f`, and `#1890ff`. The chart visuals should remain blue-first with the same meaning, just no raw hex literals.

- [ ] **Step 3: Replace trend and statistic text colors**

Update `TrendBadge.tsx` and `TypeSummaryCards.tsx` to use semantic success/error/text-muted token values via `theme.useToken()` or token exports, so net income and trend indicators no longer embed hex strings.

- [ ] **Step 4: Verify the dashboard files lint and type-check**

Run:

```bash
cd apps/web-next
npm run lint -- \
  src/constants/transactionTypes.ts \
  src/pages/dashboard/components/TrendChart.tsx \
  src/pages/dashboard/components/SpendingTrendlineChart.tsx \
  src/pages/dashboard/components/TagBar.tsx \
  src/pages/dashboard/components/TrendBadge.tsx \
  src/pages/dashboard/components/TypeSummaryCards.tsx
npm run check-types
```

Expected: ESLint and TypeScript both pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/web-next/src/constants/transactionTypes.ts apps/web-next/src/pages/dashboard/components/TrendChart.tsx apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx apps/web-next/src/pages/dashboard/components/TagBar.tsx apps/web-next/src/pages/dashboard/components/TrendBadge.tsx apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx
git commit -m "feat(theme): tokenise dashboard colours"
```

### Task 3: Migrating settings, empty states, and alerts to tokens

**Files:**
- Modify: `apps/web-next/src/components/EmptyState.tsx`
- Modify: `apps/web-next/src/components/environment-banner/index.tsx`
- Modify: `apps/web-next/src/pages/settings/index.tsx`
- Modify: `apps/web-next/src/utility/budgetAlerts.ts`

- [ ] **Step 1: Remove remaining literal colors from shared UI surfaces**

Update the reusable empty state, environment banner, settings danger zone, and budget progress helpers so they use the shared token layer for text, borders, warning, and danger colors. Preserve the current behavior and wording; only replace the color plumbing.

- [ ] **Step 2: Keep Ant Design component semantics intact**

Do not replace Ant Design `Alert`, `Card`, `Empty`, `Button`, or `Progress` with custom wrappers. The point of this task is to feed those existing components token values so the Refine/AntD stack stays idiomatic.

- [ ] **Step 3: Verify the shared surfaces**

Run:

```bash
cd apps/web-next
npm run lint -- \
  src/components/EmptyState.tsx \
  src/components/environment-banner/index.tsx \
  src/pages/settings/index.tsx \
  src/utility/budgetAlerts.ts
npm run check-types
```

Expected: no lint errors and no type regressions.

- [ ] **Step 4: Commit Task 3**

```bash
git add apps/web-next/src/components/EmptyState.tsx apps/web-next/src/components/environment-banner/index.tsx apps/web-next/src/pages/settings/index.tsx apps/web-next/src/utility/budgetAlerts.ts
git commit -m "feat(theme): route shared surfaces through tokens"
```

### Task 4: Updating Playwright smoke coverage for the tokenized UI

**Files:**
- Create: `apps/web-next/e2e/tests/theme-tokens.spec.ts`

- [ ] **Step 1: Write a focused token regression spec**

Use the existing helpers from `apps/web-next/e2e/utils/test-helpers.ts` and cover three cases in one new file:

1. the login page renders with the shared typography baseline
2. the dashboard renders tokenized cards/charts/table surfaces in light mode
3. the theme toggle or dark-mode path still renders the same surfaces with the dark token set

- [ ] **Step 2: Run the new smoke test by itself**

Run:

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/theme-tokens.spec.ts
```

Expected: the new spec passes before broader verification begins.

- [ ] **Step 3: Run the full validation suite**

Run:

```bash
cd apps/web-next
npm run check-types
npm run build
npm run test:e2e:ci
```

Expected: typecheck passes, production build succeeds, and the Playwright suite passes.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/web-next/e2e/tests/theme-tokens.spec.ts
git commit -m "test(theme): cover tokenized light and dark surfaces"
```

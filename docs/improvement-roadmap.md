# MoneyLens Web Application — Improvement Roadmap

> To continue in a new session: _"Read `docs/improvement-roadmap.md` and implement the next pending item in Phase N"_

---

## Phase 1: Foundation (Quick wins)

- [x] Fix hardcoded currency — consolidate GBP/USD mismatch, add user currency preference via context/hook
- [x] Fix transaction amount input to use `<InputNumber>` instead of `<Input>`
- [x] Add React error boundaries at layout level and per page
- [x] Consolidate duplicated `TYPE_COLORS` constant into `constants/transactionTypes.ts`
- [x] Fix `ColorModeContext.setMode` — make it accept a string parameter or rename to `toggleMode`
- [x] Standardize tags pagination to `{ mode: "off" }` in `TransactionEdit` (currently uses `pageSize: 1000`)
- [x] Remove unnecessary `import React from "react"` in files that don't use it directly

---

## Phase 2: Visual Identity

- [x] Design a proper logo (SVG asset) to replace the inline SVG `<text>` in Arial — `assets/logo-{mark,lockup,full}-{light,dark}.svg`, used in `components/title/index.tsx`
- [x] Define custom Ant Design theme tokens (brand colors, typography, spacing) — `theme/tokens.ts` (`BRAND` palette), wired into `ConfigProvider` via `contexts/color-mode/index.tsx`
- [x] Add a distinctive web font (e.g., DM Sans or Plus Jakarta Sans) — self-hosted `@fontsource/inter` (4 weights), `APP_FONT_FAMILY` in `theme/tokens.ts`
- [x] Improve dark mode with brand-specific color tokens — `theme/tokens.ts` has explicit light/dark variants for primary/link/menu-selected colors

---

## Phase 3: Data Visualization

- [x] Add net income card to dashboard (earnings − spending)
- [x] Add spending trendline chart by category/tag (replaced original donut/pie chart plan)
- [x] Add spending trend line/bar chart (last 6–12 months)
- [x] Add month-over-month comparison with trend arrows (↑↓) on summary cards
- [x] Animate budget progress bars
- [x] Surface unused DB view: `view_monthly_tagged_type_totals` (tag analytics in Charts tab)
- [x] Fix chart timelines to fill the full selected date range with zero-value months (PR #136 follow-up)
- [x] Use safe internal Recharts series keys (`k0`, `k1`, …) to prevent dot/bracket name resolution issues
- [x] Add dashboard Charts tab Playwright smoke test

---

## Phase 4: Feature Depth

- [ ] Bank account balance tracking (running balance computed from transactions)
- [x] Tag-based analytics page/section — `TagBar.tsx` (tag totals) in the dashboard Charts tab, plus a Usage Count column on `pages/tags/list.tsx` via `tags_with_usage`
- [x] Export transactions to CSV with date range filter — Settings → Export card, `DatePicker.RangePicker` + presets, `csvExport.ts`/`exportTransactions.ts`
- [ ] Budget trajectory: "at this rate you'll exceed by day X"
- [ ] Recurring transaction support (mark transactions as recurring, upcoming bills dashboard section)
- [ ] User profile page (display name, currency preference, date format, avatar)
- [ ] Guided "reset + import" restore feature — full JSON restore currently requires a manual two-step (Danger Zone reset, then Import); product decision needed on whether to build a single guided flow. If built, needs e2e coverage for the full export → reset → import round trip. See `docs/superpowers/plans/2026-08-10-json-export-import-full-restore.md` items 6-7.
- [ ] Dashboard budget cards ignore the year selector — `useBudgets()` (`apps/web-next/src/pages/dashboard/useBudgets.ts`) fetches every budget unfiltered, and `<BudgetsSection />` is rendered in `dashboard/index.tsx` without the page's `selectedYear` state ever being passed down. A budget whose `start_date`/`end_date` range doesn't overlap the selected year still renders — e.g. a "2025 Eating Out budget" (start `2025-01-01`, end `2025-12-31`) stays visible when the dashboard year is switched to 2024 or 2023. Fix: pass `selectedYear` into `useBudgets`/`BudgetsSection` and filter out budgets whose range doesn't overlap the selected year (treat a null `start_date`/`end_date` as open-ended).
- [ ] Budget cards on the dashboard aren't clickable — `BudgetsSection` (`apps/web-next/src/pages/dashboard/BudgetsSection.tsx`) renders each budget's `<Card>` with no `onClick`/navigation. A budget already acts as an implicit filter (linked categories/tags via `budget_categories`/`budget_tags`, plus its own date range), so clicking one should navigate to the Transactions list pre-filtered by those categories/tags and the budget's date range, the same way a user would filter manually today.

---

## Phase 4b: User Settings (Backend)

> **Status**: Done except `date_format`. Built via a simpler mechanism than originally sketched below — no dedicated `get_or_create_user_settings()` DB function; instead `utility/userSettings.ts`'s `upsertUserSettings()` does a plain `.upsert(patch, { onConflict: "user_id" })`, which achieves the same get-or-create effect without a bespoke RPC.

- [x] Create `user_settings` table: `user_id` (FK → `auth.users`), `currency` (text) — `supabase/migrations/20260425000002_add_user_settings.sql`
- [x] Enable RLS on `user_settings` — `user_settings_select`/`_insert`/`_update` policies, all scoped to `user_id = auth.uid()`
- [x] Upsert-on-first-access equivalent to a get-or-create function — `utility/userSettings.ts`'s `upsertUserSettings()`
- [x] Expose settings via a direct table read in `CurrencyContext` — `contexts/currency/index.tsx` reads `user_settings.currency`
- [x] On app load, fetch settings from DB and seed `CurrencyContext` (fall back to `localStorage` while loading) — seeded synchronously from `localStorage`, then overwritten by the DB value in the `onAuthStateChange` handler
- [x] On currency change in Settings, persist to DB (and keep `localStorage` as offline cache) — `setCurrency()` updates both
- [ ] Extend `user_settings` with `date_format` and wire it to date display across the app — no `date_format` column exists anywhere yet; this is the one real remaining gap in this phase

---

## Phase 5: Polish

- [ ] Responsive mobile design — sidebar collapse-to-drawer already comes free from Refine's `ThemedLayout` on small screens, but `transactions/list.tsx` still renders a plain AntD `Table` with no card-based fallback for mobile; that part is still todo
- [ ] Page transitions and micro-interactions
- [ ] Custom empty states with illustrations — `EmptyState.tsx`/`EmptyStates.tsx` provide per-resource custom title/description/CTA and are wired into all list pages, but still use AntD's stock `Empty.PRESENTED_IMAGE_SIMPLE` icon rather than real illustration artwork
- [x] Register quick-add transaction action in RefineKbar — `hooks/useQuickActions.ts`, wired in `components/header/index.tsx`
- [x] Budget threshold alerts (80% warn / 100% over — inline progress tags on list and dashboard)
- [ ] Improve Settings Import section: add CSV support and downloadable JSON template (section renamed from "Bulk Upload" to "Import"; still JSON-only, no template download button)
- [ ] Branded auth page shell — login/register/forgot-password/update-password still use Refine's stock `AuthPage` with only a branded title prop, not a fully custom shell. Originally scoped in the paused "Quiet Ledger" plan (`docs/superpowers/plans/2026-05-30-quiet-ledger.md`) but never picked up by the theme-token-extraction work that superseded it. Cosmetic, low priority.

---

## Known Bugs

Surfaced by a 2026-07-18 project review (`docs/superpowers/plans/2026-07-18-project-review-security-code-ux.md`) and never fixed or re-tracked since:

- [ ] Trend badges don't invert color for spend — `TrendBadge`/`TypeSummaryCards` apply the same up=bad/down=good coloring to every transaction type, so a decrease in spending (a good thing) still renders red the same way a decrease in earnings would.
- [ ] Spend budgets always render red ("exception") under 80% utilization — `utility/budgetAlerts.ts` returns `"exception"` unconditionally for `type === "spend"` regardless of percent, instead of only flagging over-threshold.
- [ ] Weak local auth policy in `supabase/config.toml` (`minimum_password_length = 6`, empty `password_requirements`, `enable_confirmations = false`) — flagged as finding S3, never fixed. Local dev config only; worth checking whether the hosted Supabase project mirrors it.
- [x] ~~Transactions list can hide a row depending on page size~~ — reported in production 2026-08-24 (council tax transaction on 11/08/2026 missing at 10-items-per-page, visible at 20/50). **Confirmed and fixed**: reproduced directly against the `transactions_with_details` REST endpoint by seeding 22 same-date rows and comparing paginated fetches at different page sizes — paging at size 10 returned only 23 unique ids across 30 fetched rows (6 duplicates, meaning other rows were silently skipped). Root cause: `transactions/list.tsx`'s sorter had no tie-breaker column, so Postgres doesn't guarantee stable ordering among same-`date` rows across separate `.range()` queries. Fixed by always appending `id` as a secondary sort key — both in the initial default sorter and via a `useEffect` that normalizes `sorters` whenever they change (covers the URL-restored-sorters case that neither the initial config nor a naive `onChange` override would catch; see the in-code comments in `list.tsx` for why). Covered by a new e2e regression test (`transactions.spec.ts`, "every transaction on a tied sort date appears exactly once when paging at page size 10") that seeds 22 same-date rows and asserts every one appears exactly once while paging at size 10.

---

## Phase 6: Test Coverage

Gaps identified against `docs/superpowers/specs/2026-04-18-testing-coverage-plan.md`'s own priority matrix — some items shipped since that spec was written, these did not:

- [ ] Component test infrastructure — `@testing-library/react` isn't installed at all, which blocks all component-level tests (transaction form validation, budget progress display, transaction filters), not just the individual missing ones below
- [ ] Dashboard e2e test only checks structural visibility — `e2e/tests/dashboard.spec.ts` asserts sections/labels render, never asserts the actual numeric data matches seeded transactions (would pass even with empty/wrong chart data)
- [ ] pgTAP coverage for `budgets_with_linked` view (`category_count`/`tag_count`/soft-delete exclusion) — zero tests reference it
- [ ] Budget RLS delete-isolation — cross-user SELECT/INSERT/UPDATE isolation is covered across `atomic_budget_with_links_test.sql`/`budget_progress_test.sql`, but no test verifies User 1 can't delete User 2's budget
- [ ] Dedicated soft-delete-isolation e2e test — no test verifies a soft-deleted record disappears from all UI surfaces
- [ ] Small unit-test gaps: `formatAmount`/`formatCurrency` (`utility/currency.ts`), `getMonthKeysInRange` (`utility/monthHelpers.ts`), `slugify`

---

## Known Architectural Tradeoffs

- A handful of direct Supabase calls (`utility/rpc.ts`, `utility/userSettings.ts`) bypass Refine's data provider — accepted, since these are RPC/upsert calls Refine's data layer doesn't support, not a scattered pattern across pages.
- Dual tag storage: `transactions.tags TEXT[]` column still exists (`20260201164000_baseline_from_schemas.sql`) alongside the newer `transaction_tags` join table it was superseded by. Flagged in `specs/2026-04-18-backend-db-plan.md` as deliberately deferred — high effort, medium risk to remove.
- `liveProvider` is configured in `App.tsx` and passed to `<Refine>`, but no component actually uses it (`useSubscription`/live mode) — either wire up real-time dashboard updates or remove the dead config.

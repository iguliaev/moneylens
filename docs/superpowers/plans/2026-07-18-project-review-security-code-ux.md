# Moneylens Project Review — Security, Code, UX

**Date:** 2026-07-18
**Scope:** All 17 migrations, auth/config layer, full `apps/web-next` frontend source, lint + typecheck, live walkthrough of the running app (desktop + mobile viewports) with the seeded test user.

**TL;DR:** The project is in good shape overall — RLS coverage is thorough, pgTAP and e2e test coverage is genuinely strong, no secrets are tracked in git, and the UI is clean and responsive. The most important findings: two real security gaps in database functions (`get_transaction_tags` has no ownership check; the category-type trigger doesn't verify category ownership), soft-deleted tags/bank accounts still appear in form dropdowns, and the dashboard trend badges use inverted color semantics for spending. TypeScript compiles clean; ESLint has 15 errors.

---

## 1. Security review

### Should fix

**S1. `get_transaction_tags` is an IDOR** — `supabase/migrations/20260201164000_baseline_from_schemas.sql:1251`. It's `SECURITY DEFINER` but never checks that the transaction belongs to `auth.uid()`. Any authenticated user who obtains a transaction UUID can read another user's tag names/descriptions. Every other RPC in the schema does this check. Random UUIDs make exploitation hard, but it's the only function in the codebase with this hole — add `AND EXISTS (SELECT 1 FROM public.transactions WHERE id = p_transaction_id AND user_id = auth.uid())` or make it `SECURITY INVOKER`.

**S2. Category ownership not enforced on transactions** — `check_transaction_category_type` (baseline migration, line 507) validates only that the category's *type* matches, not that the category belongs to the same user. The parallel `check_transaction_bank_account` trigger *does* check ownership. Via direct PostgREST calls (bypassing the app's RPCs), a user can link their transaction to another user's `category_id`. Impact is integrity rather than disclosure (RLS hides the foreign category's name in views), but it breaks the tenancy model and the fix is one line in the trigger.

**S3. Auth policy is weak in `supabase/config.toml`** — `minimum_password_length = 6`, `password_requirements = ""`, and email confirmations disabled. If the hosted project mirrors these settings, this is weak for an app holding financial data. Recommend 8+ chars with requirements, email confirmation on, and enabling leaked-password protection in the hosted dashboard.

**S4. `transactions.user_id` is nullable with no `ON DELETE CASCADE`** — unlike every other table (`categories`, `tags`, `bank_accounts`, `budgets`, `user_settings` all cascade). Deleting a user from Supabase Auth will fail on the FK or orphan rows. This matters for account-deletion/GDPR flows. Add `NOT NULL` + cascade in a new migration.

### Worth doing

- **No security headers**: `vercel.json` only has an `ignoreCommand` — no CSP, HSTS, `X-Frame-Options`, or `Referrer-Policy`. Since the Supabase session token lives in localStorage (standard for this stack), a CSP is the main XSS mitigation. (No `dangerouslySetInnerHTML` or other injection sinks found in the app itself; Ant Design/React escape by default.)
- **Soft delete only wraps `deleteOne`** (`src/utility/softDeleteDataProvider.ts`) — if any future UI uses Refine's `deleteMany`, it will silently *hard*-delete. Wrap it now while it's cheap.
- **RPC error surfaces raw `SQLERRM`** to the client in bulk upload — minor internals leak; fine for now, worth sanitizing later.
- `SUPABASE_SERVICE_ROLE_KEY` lives in local `.env.local` for e2e fixtures. It's correctly gitignored and un-prefixed (won't be bundled by Vite) — just make sure it never gets added to Vercel env vars.

**What's good:** every table has owner-scoped RLS with the `(SELECT auth.uid())` initplan pattern, all views are `security_invoker`, all functions pin `search_path = ''`, SECURITY DEFINER RPCs (except S1) verify ownership, and there are dedicated pgTAP RLS tests plus e2e user-isolation tests. This is well above average.

---

## 2. Deep code review

### Bugs

**C1. Soft-deleted tags and bank accounts still appear in dropdowns.** Transaction create/edit and the list-page filters query the base `tags` and `bank_accounts` tables directly (`src/pages/transactions/create.tsx:77-90`, `list.tsx:102-117`), which don't filter `deleted_at`. Categories avoid this by using the `categories_with_usage` view. A user who deletes a tag will still see it offered on the transaction form — and picking a deleted tag will then be *rejected* by `create_transaction_with_tags` ("not found or access denied"). Point these selects at the `*_with_usage` views or add a `deleted_at is null` filter.

**C2. ESLint: 15 errors.** The real one is `src/components/EmptyStates.tsx` — five `get*EmptyState()` functions call the `useNavigation` hook but aren't components/hooks (`rules-of-hooks`). It happens to work because they're invoked during render, but it's fragile (the list.tsx comment "Always call to keep React hook call count consistent" is compensating for the design). Rename them to proper components or a single `useEmptyState` hook. The other 10 errors are `throw` inside `finally` in `e2e/tests/transactions.spec.ts`, which can swallow the original test failure.

**C3. Ant Design 5 doesn't support React 19** — the console logs `antd v5 support React is 16 ~ 18` on every page. Things visibly work, but this is an unsupported combination that can break subtly on antd upgrades. Either add the official `@ant-design/v5-patch-for-react-19` compatibility patch or track antd's React 19 support.

**C4. 1,000-row silent truncation risk.** `config.toml` sets `max_rows = 1000`, and the dashboard/chart hooks (`usePeriodStats`, `useChartsData`, `useBudgets`) all use `pagination: { mode: "off" }`. A long-lived account with >1,000 monthly-category rows in a range will get silently wrong totals. Either constrain ranges, or aggregate server-side (RPC) for the charts.

**C5. Budget create isn't atomic** (`src/pages/budgets/create.tsx:68-114`) — the budget row is created first, then `budget_categories`/`budget_tags` are inserted from the client. A failure leaves an unlinked budget behind (the user gets an error toast, but the orphan persists). The `create_transaction_with_tags` RPC pattern already exists; a `create_budget_with_links` RPC would match it.

### Smaller points

- `retryWithBackoff` (`src/utility/retry.ts`) indexes a fixed 3-element `delays` array; `maxRetries > 3` yields `setTimeout(..., undefined)` (0ms). Compute the delay instead.
- Console warns `useForm is not connected to any Form element` on transaction create — the form instance from Refine's `useForm` isn't fully wired since the page bypasses its `onFinish`; worth tidying.
- Duplicate ESLint toolchains in `package.json`: legacy `@typescript-eslint/{parser,eslint-plugin}` v5 alongside `typescript-eslint` v8 — drop the v5 pair.
- `Dockerfile` uses `refinedev/node:18` — Node 18 is EOL (April 2025). If Vercel is the real deploy target, consider deleting the Dockerfile; if not, bump the base.
- The transactions table filter on `tag_ids` uses the `in` operator against a Postgres array column — verify it actually filters (array columns usually need `contains`/`cs` semantics via PostgREST).

Otherwise the frontend is well-factored: typed RPC wrappers with an enforced "intentional direct supabase" convention, null-safe view-row mapping in `useBudgets`, thoughtful comments explaining *why* (e.g. raw vs rounded percent in `budgetAlerts.ts`), and `tsc --noEmit` passes clean.

---

## 3. UX design review

**What works well:** consistent Refine/AntD layout, skeletons on first load, empty states with clear CTAs everywhere, environment banner, kbar command palette, type prefilled from the active tab when creating a transaction, hierarchical "Parent / Child" category labels with search, UK date format, and the mobile layout stacks cleanly with no horizontal scroll.

Issues, in priority order:

**U1. Trend badge colors are inverted for spending.** `TrendBadge.tsx` hard-codes up=green / down=red. On the dashboard, "Spend ↓ 94.5% vs prev period" renders *red* — but spending less is good news. For the Spend card (and arguably Net Income when negative), the semantic should flip: spend-down = green, spend-up = red. This is the single most misleading thing on the dashboard.

**U2. Spend budgets are always red.** `getProgressStatus` returns `"exception"` for any spend budget under 80% — a budget at 10% utilization shows a red bar, the same color as "over budget". The comment says it's intentional, but visually it destroys the alert hierarchy: red should mean "act now", not "this is a spend budget". Neutral until 80% (then amber, then red) would make the warn/over states meaningful.

**U3. Amounts are formatted inconsistently.** The dashboard shows `£42.31`; the transactions list shows bare `11.54` (`formatAmount` ignores the user's currency setting entirely). Use the currency-aware formatter everywhere — the user's currency is already persisted in `user_settings`.

**U4. Transaction create: Date doesn't default to today.** It's the most common value and the first required field — one extra interaction on the app's most frequent flow. Also, Amount could show the currency prefix.

**U5. "↓ 100.0% vs prev period" on a £0.00 Earn card** reads as noise/alarm. When current is zero, plain wording ("No earnings this period") beats a percentage.

**U6. Net Income = Earn − Spend, with Save shown separately.** Observed: Earn £0, Spend £42, Save £59, Net Income −£42. Whether "save" is an outflow is ambiguous — a tooltip or subtitle ("excludes savings") on the Net Income card would prevent misreading.

**U7. Minor polish:** emoji-in-label inconsistency ("📊 Charts", "⚠ Danger Zone" vs. plain labels elsewhere); the header search placeholder says "Search transactions, categories, accounts…" but kbar is a command palette, not record search — the placeholder overpromises; soft delete exists in the backend but there's no "Undo" affordance after deleting (a snackbar-undo would be cheap and safer than the current permanent-feeling delete).

---

## Suggested priority

1. **Now:** S1, S2 (one small migration covers both), C1 (dropdown filtering), U1 (trend colors).
2. **Next:** S3 (auth hardening), S4 (user_id cascade), C2 (lint errors), U2–U4.
3. **Later:** security headers, budget-create RPC, max_rows strategy, React 19/antd compat, Node 18 Dockerfile, remaining polish.

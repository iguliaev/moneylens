# Deep code review fixes — implementation plan

**Date:** 2026-07-25
**Status:** Complete — all items 1-8 done
**Source:** `docs/superpowers/plans/2026-07-18-project-review-security-code-ux.md` §2 (Deep code review)
**Scope:** C1-C5 and the smaller points from that section. The security findings (§1) from the same review were already fixed in an earlier batch (PRs #238-#240). UX findings (§3) are out of scope here.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-07-27** — Step 8 (final regression pass) done, run on top of `chore/cleanup-retry-eslint-dockerfile` (not yet merged/PR'd) with local `main` already including PRs #244-#249: `supabase db reset` applied all 27 migrations cleanly; `supabase test db` 238/238 (17 files); `npm run test:unit` 7/7; `npm run test:e2e:ci` (full suite) 105/105; `npm run lint` 0 errors/4 pre-existing unrelated warnings; `npm run check-types` clean; `npm run build` clean (pre-existing chunk-size and Refine-update-available notices only, no errors). All 8 plan items now complete.
- **2026-07-27** — Step 7 (cleanup points) done: deleted `apps/web-next/src/utility/retry.ts` (confirmed zero callers/re-exports via grep before removing), deleted `apps/web-next/Dockerfile` (confirmed unreferenced in any `.github/workflows/*.yaml`), removed the unused `@typescript-eslint/{eslint-plugin,parser}` v5 pair from `package.json` and ran `npm uninstall` to keep the lockfile consistent (`eslint.config.js` only ever wired up the `typescript-eslint` v8 meta-package). `npm run lint`/`check-types`/`build` all clean (same 4 pre-existing unrelated fast-refresh warnings, no errors).
- **2026-07-27** — Step 6 (tag filter fix) shipped: branch `fix/tag-filter-or-semantics`. Confirmed via `@refinedev/supabase`/`@refinedev/core` source read (matching the plan's analysis) that a bare "ina" filter maps to postgrest `.contains()` (AND-of-values semantics against the array column), so multiple tags need one `"ina"` filter per tag combined with `.or(...)` — not a single multi-value "in"/"ina". Replaced `transactions/list.tsx`'s `tag_ids` column filter with a fully custom `TagsFilterDropdown` (own pending-selection state, calls `setFilters([buildTagIdsOrFilter(tagIds)])` directly, uses antd's `close()` prop rather than `confirm()` so refine's own selectedKeys/"in" machinery never touches this column) plus a custom `filterIcon` reading the CRUD filter state directly (since `filteredValue` is left uncontrolled to avoid antd re-injecting a stale "in" filter on unrelated filter changes). New e2e test (`transactions.spec.ts`, "filtering by multiple tags matches transactions with any selected tag") seeds 3 transactions (tag A only / tag B only / untagged), asserts OR semantics, asserts no non-2xx response, and checks the filter survives a direct URL reload. Verified TDD-style: stashed the fix and confirmed the test fails (non-2xx response) against the old "in"-operator code, then restored the fix and confirmed green. Full `transactions.spec.ts` suite: 27/27. `npm run check-types`/`lint` clean (4 pre-existing unrelated warnings only).
- **2026-07-27** — Local `main` fast-forwarded to pick up [PR #248](https://github.com/iguliaev/moneylens/pull/248) (C3, merged in a prior session not tracked here); PR #246 (transaction zero-row-update guard, from the review-fix pass on PR #245) also confirmed merged with CI green. No plan-relevant code changed this entry.
- **2026-07-26** — C3 committed (branch `fix/antd-react19-patch`): considered upgrading antd straight to v6 (natively supports React 19, no patch needed) instead of patching v5, but confirmed `@refinedev/antd@6.0.3` (latest) still peer-depends on `antd: ^5.23.0` with an open, unresolved upstream issue ([refinedev/refine#7140](https://github.com/refinedev/refine/issues/7140)) — v6 is blocked until Refine ships support, so stuck with the patch as planned. Installed `@ant-design/v5-patch-for-react-19` as a prod dependency, added a side-effecting import as the first line of `src/index.tsx` (README confirmed a plain import is sufficient, no `unstableSetRender()` call needed). `npm run check-types`/`lint`/`build` all clean. Verified via Playwright against the dev server: zero console warnings/errors on `/login` (Form/Input/Button/Card — solid antd surface), confirming the React-19 compat warning is gone. Not yet pushed/PR'd.
- **2026-07-26** — Synced `fix/atomic-budget-with-links` with `main` after C1 (PR #244) merged. Auto-merged cleanly except for this doc's progress log (expected — both branches logged independently); resolved by keeping one deduplicated timeline below.
- **2026-07-26** — C5 (steps 1-3) committed and shipped: [PR #245](https://github.com/iguliaev/moneylens/pull/245) (branch `fix/atomic-budget-with-links`). `rpc.ts` gained `createBudgetWithLinks`/`updateBudgetWithLinks` wrappers (+ `BudgetWithLinksInput`) mirroring the transaction RPC convention; new `hooks/useBudgetForm.ts` mirrors `useTransactionForm.ts` (single `handleFinish` calling the RPC once, notifying on error, invalidating `budgets_with_linked` + navigating on success). `budgets/create.tsx` lost `extractCreatedBudgetId` and the manual `budget_categories`/`budget_tags` insert/delete calls; `budgets/edit.tsx` lost the 5-step update/delete/insert sequence — both now just wire `onFinish={handleFinish}` from `useBudgetForm`, keeping `useForm()` only for `formProps`/`saveButtonProps`/prefill (same split as transactions). `npm run check-types`/`lint`/`build` all clean. Full regression pass: `supabase test db` 233/233, `npm run test:unit` 7/7, `budgets.spec.ts` 11/11, `transactions.spec.ts` 25/26 (1 failure reproduced as flaky/pre-existing — passed in isolation on retry, unrelated to this change since transactions code wasn't touched). See PR #245 for details; not tracked further here.
- **2026-07-26** — C1 (step 4) split off and shipped separately, since it's fully independent of this C5 work: branch `fix/c1-soft-deleted-visibility`, [PR #244](https://github.com/iguliaev/moneylens/pull/244) (merged into `main`). See that PR for details; not tracked further here.
- **2026-07-26** — Step 2 done: ran `supabase gen types typescript --local`, manually synced the new `create_budget_with_links`/`update_budget_with_links` function signatures into `apps/web-next/src/types/database.types.ts` (alphabetical placement, matching existing style/casing of the transaction RPC entries). `npm run check-types` clean. Remaining diff between generated output and checked-in file is pre-existing, unrelated `transactions.user_id` nullability drift — left untouched, out of scope. Stopping here per instruction — not proceeding to step 3 (C5 frontend) until told to continue.
- **2026-07-26** — Step 1 done (branch `fix/atomic-budget-with-links`): added `supabase/migrations/20260725120000_atomic_budget_with_links.sql` (`create_budget_with_links`/`update_budget_with_links`, mirroring the transaction RPC pattern) and `supabase/tests/atomic_budget_with_links_test.sql` (23 pgTAP cases). Applied locally via `supabase db reset`; full `supabase test db` suite green (233/233, all files). Stopping here per instruction — not proceeding to step 2 (type regen) until told to continue.
- **2026-07-25** — Plan created (PR #242). Not started.

---

Every finding below was independently re-verified against the current repo (2026-07-25) via three parallel Explore agents plus direct reads of `node_modules/@refinedev/{core,antd,supabase}` source — not just trusted from the original review, which is a week stale and, in one case (C2), already resolved by an unrelated PR.

**Scope decisions made with the user before writing this plan:**
- **C2** (15 ESLint errors) — resolved by PR #237 the day after the review (current lint: 0 errors, 4 unrelated warnings). **No action.**
- **C4** (1,000-row truncation) — confirmed low realistic risk; all three flagged hooks (`usePeriodStats`, `useChartsData`, `useBudgets`) query pre-aggregated views bounded by low-cardinality dimensions (transaction type, months/years, category/budget counts), not raw transaction rows. **Documented as accepted risk, no code change.**
- **Tag filter semantics**: selecting multiple tags on the transactions list should match **ANY** selected tag (OR/overlap), not all of them.
- **Dockerfile**: confirmed unused by any CI/deploy workflow (Vercel git integration is the real path) — **delete it**.
- **Header search** (`src/components/header/index.tsx`): same soft-delete-visibility bug as C1, not in the original review — **include it in the C1 fix**.

---

## 1. C1 — Soft-deleted tags/bank accounts still visible in dropdowns & search

Root cause: several `resource:` calls query raw `tags`/`bank_accounts` tables directly instead of the `tags_with_usage`/`bank_accounts_with_usage` views (already defined in `supabase/migrations/20260227201422_add_soft_delete.sql`, both `security_invoker = TRUE`, both `WHERE deleted_at IS NULL`, same column shape — `id`/`name`/`description`/`in_use_count`/etc.). Categories already do this correctly via `categories_with_usage`. **Pure frontend resource-name swap, no migration needed.**

Swap `resource: "tags"` → `"tags_with_usage"` and `resource: "bank_accounts"` → `"bank_accounts_with_usage"` at:

| File | What |
|---|---|
| `apps/web-next/src/pages/transactions/create.tsx` (~77-90) | tags (`useCoreSelect`), bank accounts (`useAntSelect`) |
| `apps/web-next/src/pages/transactions/list.tsx` (~102-117) | bank account filter, tag filter (`useSelect`) |
| `apps/web-next/src/pages/transactions/edit.tsx` (~89-104) | bank accounts, tags — same bug, not named in the original review |
| `apps/web-next/src/pages/budgets/create.tsx` (~42-46) | tags (`useList`) — not named in the original review |
| `apps/web-next/src/pages/budgets/edit.tsx` (~51-55) | tags (`useList`) — not named in the original review |
| `apps/web-next/src/components/header/index.tsx` (~172-184) | categories, bank_accounts (global search-as-you-type) |

**Out of scope, intentionally:** `transactions/show.tsx` (category/bank-account `useOne` lookups) — showing a soft-deleted entity's historical name on an already-created transaction is correct behavior, not a bug; switching it to the `_with_usage` view would break that.

**Known follow-up — ✅ done:** `tags_with_usage.in_use_count` used to aggregate via the legacy `transactions.tags TEXT[]` column (`UNNEST`) rather than the `transaction_tags` junction table the actual RPCs write to, so for any transaction written through the atomic/bulk RPCs it undercounted (expected ~0 for real data; the production row count is audited before the drop merges). Fixed as part of `docs/superpowers/plans/2026-08-31-drop-legacy-transaction-columns.md` — the view now counts via `transaction_tags`, and the legacy `transactions.category` / `bank_account` / `tags` columns were dropped in `20260831190631_drop_legacy_transaction_denormalized_columns.sql`.

---

## 2. C3 — antd5 / React 19 compatibility patch

antd 5.29.3 + React 19.2.3 are installed together with no patch; the "antd v5 support React is 16 ~ 18" console warning is real (traced to `antd`'s `UnstableContext.js` checking for `createRoot` on the top-level `react-dom` export, which only exists under `react-dom/client` in React 18+).

- `npm install @ant-design/v5-patch-for-react-19` in `apps/web-next` — as a **dependency**, not devDependency (runs in production).
- Import and invoke at the very top of `apps/web-next/src/index.tsx`, before the `createRoot` call — the earliest point that's guaranteed to run before any antd component renders.
- **Verify exact API at implementation time**: check the installed package's README (`cat apps/web-next/node_modules/@ant-design/v5-patch-for-react-19/README.md`) for the exact call — commonly either a side-effecting import or an explicit `unstableSetRender()` call.
- Verify: console warning gone in dev; `npm run build` clean; smoke-test a few antd-heavy pages (forms, tables, modals).

---

## 3. C5 — Budget create/edit isn't atomic

`budgets/create.tsx` (`handleFinish`, ~68-114) does budget INSERT → separate `budget_categories` insert → separate `budget_tags` insert, with no rollback on partial failure (orphaned budget, just a notification). `budgets/edit.tsx` (~83-140) is worse: UPDATE budget → DELETE old categories → INSERT new → DELETE old tags → INSERT new — a 5-step sequence, any of which can fail independently, again with no rollback.

Fix mirrors the existing `create_transaction_with_tags`/`update_transaction_with_tags` pattern (`supabase/migrations/20260510120000_atomic_transaction_with_tags.sql`): a `SECURITY DEFINER` plpgsql function does validation + insert/update + junction-table writes in one atomic call.

### New migration: `supabase/migrations/20260725120000_atomic_budget_with_links.sql`

Two functions (check `ls supabase/migrations/` for the actual latest timestamp before naming, in case something has landed since):

- **`create_budget_with_links(p_budget jsonb, p_category_ids uuid[], p_tag_ids uuid[]) RETURNS public.budgets`**
  - Validate every `p_category_ids`/`p_tag_ids` entry belongs to `auth.uid()` and is non-deleted (`RAISE EXCEPTION ... USING ERRCODE = '42501'` on failure) — required because `SECURITY DEFINER` bypasses the RLS checks that normally do this on `budget_categories`/`budget_tags` INSERT.
  - `INSERT INTO budgets (...) RETURNING * INTO v_budget` (the existing `tg_budgets_user_id` trigger sets `user_id`).
  - Insert into `budget_categories`/`budget_tags` with `ON CONFLICT (...) DO NOTHING`.
  - `GRANT EXECUTE ... TO authenticated`.
- **`update_budget_with_links(p_budget_id uuid, p_budget jsonb, p_category_ids uuid[], p_tag_ids uuid[]) RETURNS public.budgets`**
  - Same validation, plus confirm the budget itself belongs to the caller and is non-deleted.
  - `UPDATE budgets SET ...`.
  - `DELETE FROM budget_categories WHERE budget_id = ...` then re-insert (same replace-all pattern as `update_transaction_with_tags`); same for `budget_tags`.

Use `RETURNS public.budgets` (typed row), matching the transaction RPC convention — not `jsonb` — so the frontend can type it the same way (`Tables<"budgets">`).

### Frontend

- `apps/web-next/src/utility/rpc.ts`: add `createBudgetWithLinks`/`updateBudgetWithLinks` wrappers (mirror the existing `// INTENTIONAL_DIRECT_SUPABASE` convention used for the transaction RPCs), re-export from wherever those are barreled.
- New `apps/web-next/src/hooks/useBudgetForm.ts`, mirroring `useTransactionForm.ts`: single `handleFinish` that calls the RPC once, checks `result.error`, notifies on failure, invalidates + navigates on success.
- `budgets/create.tsx` / `budgets/edit.tsx`: remove the multi-step `handleFinish` (and `extractCreatedBudgetId` in create.tsx), wire `onFinish={handleFinish}` from `useBudgetForm`, keep `useForm()` only for `formProps`/`saveButtonProps`/prefill — same split already used in `transactions/create.tsx` between `useForm` (for button/form plumbing) and `useTransactionForm` (for the actual RPC-backed submit).

### Types

After applying the migration: `supabase gen types typescript --local` at repo root, then manually sync the new function signatures into `apps/web-next/src/types/database.types.ts` (not auto-synced today).

### Tests

- New `supabase/tests/atomic_budget_with_links_test.sql`, mirroring `supabase/tests/atomic_transaction_with_tags_test.sql`'s structure and density (~18 cases: function existence, happy-path create/update with categories/tags/both, atomicity on invalid category/tag id — no orphan row left, replace-links semantics on update, cross-user rejection on budget/category/tag ownership).
- Existing e2e coverage (`apps/web-next/e2e/tests/budgets.spec.ts`, "user can create a budget with categories and tags...") already exercises the happy path through whatever code runs underneath — no new e2e test strictly required, it'll naturally start covering the new RPC path.

---

## 4. Tag filter bug — transactions list

`transactions/list.tsx` builds the tag filter via the shared `MultiSelectFilter`/`FilterDropdown` combo with no explicit operator, so `@refinedev/antd`'s `mapAntdFilterToCrudFilter` defaults to `"in"` for the array value. `tag_ids` is a `uuid[]` computed column (`ARRAY_AGG` in the `transactions_with_details` view). `query.in("tag_ids", [...])` → PostgREST `in.(...)` → Postgres `tag_ids IN (...)` is a type mismatch against an array column (`uuid[]` vs scalar list) — very likely a hard `42883` Postgres error whenever a tag filter is applied. No e2e test currently exercises this, so it's plausibly been shipping broken.

**Confirmed via direct source read** (`node_modules/@refinedev/core/dist/index.mjs`, `@refinedev/supabase/dist/index.mjs`) that a naive `"in"` → `"ina"` operator swap is not sufficient:
- `@refinedev/supabase`'s `generateFilter` *does* support an `"or"`-grouped filter (`ConditionalFilter` type: `{ key?, operator: "or"|"and", value: (LogicalFilter|ConditionalFilter)[] }`), correctly turning `{operator:"or", value:[{field:"tag_ids", operator:"ina", value:[id]}, ...]}` into PostgREST `tag_ids.cs.{"id1"},tag_ids.cs.{"id2"}` joined with `.or(...)` — exactly "has tag1 OR has tag2" semantics, using only already-supported operators.
- But `getDefaultFilter` and `mapAntdFilterToCrudFilter` both explicitly skip `"or"`/`"and"` filters when resolving a field's current operator — so relying on the antd Table's own `filterDropdown`/`onChange`/`filteredValue` machinery for this column will silently revert to the broken `"in"` default the next time the user changes the tag selection.
- `compareFilters`/`unionFilters` (used by `setFilters`) key `"or"` filters by their `key` property (not `field`), and automatically drop an `"or"` filter once its `value` array is empty (clearing all tags removes the filter for free).

**Fix**: replace the `tag_ids` column's `filterDropdown`/`filteredValue` wiring with a fully custom dropdown that never touches antd's own `setSelectedKeys`/`filteredValue` — manages its own pending-selection state, and calls `setFilters` directly with a `ConditionalFilter`:

```ts
const TAG_IDS_OR_KEY = "tag_ids_or";

function buildTagIdsOrFilter(tagIds: string[]): ConditionalFilter {
  return {
    key: TAG_IDS_OR_KEY,
    operator: "or",
    value: tagIds.map((tagId) => ({ field: "tag_ids", operator: "ina", value: [tagId] })),
  };
}

function getTagIdsFilterValue(filters: CrudFilters): string[] {
  const orFilter = filters.find(
    (f): f is ConditionalFilter => f.operator === "or" && "key" in f && f.key === TAG_IDS_OR_KEY
  );
  if (!orFilter) return [];
  return orFilter.value
    .filter((f): f is LogicalFilter => "field" in f && f.field === "tag_ids")
    .flatMap((f) => f.value as string[]);
}
```

Replace the `Table.Column key="tag_ids"` block's `filterDropdown` with a small local `TagsFilterDropdown` component (own `useState` for pending selection, initialized from `getTagIdsFilterValue(filters)`) that on "Filter" click calls `setFilters([buildTagIdsOrFilter(pending)])` (empty array clears via `unionFilters`'s automatic drop) and closes the dropdown. Other filterable columns (`category_id`, `bank_account_id`, `amount`) are unaffected — confirmed their path only processes keys actually present in antd's per-column filter state, which `tag_ids` will no longer register into.

**Verify at implementation time**: exact `close`/`confirm` prop available on antd 5.29.3's `filterDropdown` render signature (mechanical check, `confirm()` is a safe fallback); and that the `"or"`+`key`-shaped filter round-trips correctly through `syncWithLocation`'s URL query-string (de)serialization — check by loading a URL with the filter params directly.

**Test**: add to `apps/web-next/e2e/tests/transactions.spec.ts` — seed transactions with 2+ distinct tags, apply a 2-tag filter via the UI, assert only transactions with *at least one* selected tag appear (proves OR semantics) and assert no non-2xx response occurs (proves the crash is actually fixed, mirroring the existing `hasRange416`-style network-error check in that file). Also check the filter survives a direct URL load.

---

## 5. Smaller cleanup points

- **`apps/web-next/src/utility/retry.ts`** — `retryWithBackoff` has a real bug (`delays[attempt]` is `undefined` for `attempt >= 3`, `maxRetries > 3`) but **zero current callers anywhere in the app** (confirmed via grep). **Delete the file** rather than fix-and-keep dead code; remove any re-export in the utility barrel file if present.
- **Duplicate ESLint toolchain** — `apps/web-next/package.json` has both `@typescript-eslint/{parser,eslint-plugin}` v5 (unused — `eslint.config.js` only wires up the `typescript-eslint` v8 meta-package) and `typescript-eslint` v8. Remove the v5 pair from `package.json`, run `npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser` to keep the lockfile consistent, confirm `npm run lint` still passes.
- **`apps/web-next/Dockerfile`** — pins `refinedev/node:18` (EOL), confirmed unused by any of the 12 `.github/workflows/*.yaml` files; Vercel's own git integration is the real deploy path. **Delete it.**

---

## Implementation order

- [x] 1. **C5 migration first, in isolation** — write, apply locally (`supabase db reset`), write + run the new pgTAP tests until green, *before* touching frontend code.
- [x] 2. Regenerate types (`supabase gen types typescript --local`) and sync into `apps/web-next/src/types/database.types.ts`.
- [x] 3. **C5 frontend** — `rpc.ts` → `useBudgetForm.ts` → `budgets/create.tsx`/`edit.tsx` refactor. Run `apps/web-next/e2e/tests/budgets.spec.ts` to confirm the happy path still works end-to-end against the new RPC.
- [x] 4. **C1** — mechanical resource-name swaps across the six files + header search. Manually verify: soft-delete a tag/bank account, confirm it disappears from every affected dropdown/search. **Shipped separately: [PR #244](https://github.com/iguliaev/moneylens/pull/244) (merged into `main`).**
- [x] 5. **C3** — install + wire the antd patch. Verify console warning gone, `npm run build` clean. **Shipped: [PR #248](https://github.com/iguliaev/moneylens/pull/248) (merged into `main`).**
- [x] 6. **Tag filter fix** — write the new e2e test first (should currently fail/error against unfixed code, confirming the bug is real), then implement, confirm it goes green. Manually check the Network tab shows `.or(...)`/`cs` syntax, not `tag_ids=in.(...)`. **Shipped: [PR #249](https://github.com/iguliaev/moneylens/pull/249) (merged into `main`).**
- [x] 7. **Cleanup points** — retry.ts deletion, ESLint dedup, Dockerfile deletion. Low risk, verify via `npm run lint` / `npm run build` / `npm run check-types`.
- [x] 8. **Final regression pass**: `npm run test:unit`, `npm run test:e2e:ci`, `npm run lint`, `npm run check-types`, plus the full pgTAP suite (`supabase test db`).

## Critical files

- `apps/web-next/src/pages/transactions/{list,create,edit}.tsx`
- `apps/web-next/src/pages/budgets/{create,edit}.tsx`
- `apps/web-next/src/components/header/index.tsx`
- `apps/web-next/src/utility/rpc.ts`, `apps/web-next/src/hooks/useBudgetForm.ts` (new)
- `apps/web-next/src/index.tsx`
- `supabase/migrations/20260510120000_atomic_transaction_with_tags.sql` (pattern reference)
- `supabase/migrations/20260725120000_atomic_budget_with_links.sql` (new)
- `apps/web-next/src/utility/retry.ts` (delete), `apps/web-next/Dockerfile` (delete)

## Verification plan

1. `supabase test db` — full pgTAP suite including the new `atomic_budget_with_links_test.sql`.
2. `cd apps/web-next && npm run lint && npm run check-types && npm run build`.
3. `cd apps/web-next && npm run test:e2e:ci` — full suite, including the new tag-filter test and the existing budget-links test.
4. Manual: soft-delete a tag and a bank account, confirm both disappear from transaction create/edit/list filters, budget create/edit, and header search, but a transaction still shows the deleted entity's name on its own detail page.
5. Manual: confirm the antd/React 19 console warning is gone.

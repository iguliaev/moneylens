# Transaction entry defaults & export range presets — implementation plan

**Date:** 2026-08-01
**Status:** Implemented — all steps done, `supabase test db` and the full Playwright suite green
**Scope:** In — default date on the transaction Create form; user-configurable per-type default Category/Bank Account plus a default Type, edited in a new Settings tab; preset date ranges on Settings → Export. Out — any change to the transaction Edit form, and any change to the bulk-upload/export payload shapes.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-08-01** — All 8 steps implemented. `supabase test db` 275 tests green (18 files); full Playwright suite 118 tests green.

  Two things diverged from the plan, both in the Create form (§2e):

  1. **`initialValues` had to be frozen at mount.** The plan said "add `date: dayjs()` to the `mergedInitialValues` memo". That memo recomputes when `formProps.initialValues` changes identity, producing a fresh `dayjs()` — and antd re-seeds the field from the new object, discarding a date the user is part-way through typing. Replaced the memo with a `useState(() => …)` initialiser, and moved the default `type` out of `initialValues` entirely (it can arrive asynchronously with the stored default, so an effect applies it instead).
  2. **`getValueProps` was rewrapping an already-Dayjs value.** `dayjs(value)` returns a new instance on every render; rc-picker reads a new `value` identity as an external change and throws away in-progress typed text. Any background query resolving mid-typing silently reverted the date. This was pre-existing but latent — the two new queries this feature adds widened the window enough that ~5 existing tests began failing intermittently. Extracted `toDayjs()` (`utility/dayjsValue.ts`), which returns the same instance when the value is already a Dayjs, and applied it to both the create and edit forms.

  Also added, beyond the plan: `toLeafCategoryOptions` / `categoryFilterOption` in `utility/categoryHierarchy.ts`, replacing the same filter/sort/map and filter predicate that had been copy-pasted across the create form, the edit form, and the new settings grid; and an `.sr-only` class in `styles/global.css` for the grid's per-cell labels.

- **2026-08-01** — Plan created from a UX review of the live web UI. Not started.

---

## Context

Three friction points found while using the web UI:

1. **Every new transaction requires picking a date manually.** `transactions/create.tsx` renders the Date `DatePicker` with no initial value, so the overwhelmingly common case (entering today's transaction) costs an extra interaction every time.
2. **Category and Bank Account are always empty on Create.** Most users have a habitual account/category per transaction type (Earn → current account + Salary, Spend → credit card + Groceries, Save → investment account). Today all of that is re-selected from scratch on every entry, and there is no place to express a default.
3. **Settings → Export forces manual date entry.** `ExportSection` uses a bare `DatePicker.RangePicker` with the Export button disabled until both ends are typed. "Last month" / "Last year" are the common cases and cost two date entries each.

Intended outcome: opening Create pre-fills Date, Type, Category and Bank Account so a typical entry is amount + save; and exporting a common period is one click.

### Decisions taken

- Defaults are edited in a **new Settings → Transactions tab**, not via inline "default" flags on the Categories/Bank Accounts list pages. Keeps preference data out of the domain tables (matching the existing `user_settings`/currency precedent) and avoids touching the bulk-upload/export/reset payload shapes.
- The default **Bank Account varies per transaction type**. This is also why inline flags don't work: `bank-accounts/list.tsx` is a bare generic `ResourceList` with no type dimension to hang a per-type default off. (Categories *are* type-scoped — `categories/list.tsx:62` has a Segmented — so inline would have worked there, but only there.)
- A **default transaction Type** is included, since the settings-tab approach gives it a natural home. Today a type is only implied when arriving from the transactions list's Create button (`transactions/list.tsx:235-239` passes `?source=transactions-list&type=`); `/transactions/create` reached from the sidebar or the kbar "Add Transaction" action (`hooks/useQuickActions.ts`) arrives with nothing set.

---

## 1. Default date = today

`apps/web-next/src/pages/transactions/create.tsx` — add `date: dayjs()` to the `mergedInitialValues` memo (currently lines 43-56). The existing `getValueProps` on the Date `Form.Item` already normalises through `dayjs()`, and `useTransactionForm.handleFinish` already serialises a Dayjs to `YYYY-MM-DD`, so no other change is needed.

`transactions/edit.tsx` is untouched — it loads the persisted date.

---

## 2. Per-type defaults for Category, Bank Account, and Type

### 2a. Migration

`supabase migration new transaction_defaults`

**Default type** — new nullable column on the existing settings table:

```sql
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS default_transaction_type public.transaction_type;
```

**New table** for the per-type pair:

```sql
CREATE TABLE IF NOT EXISTS public.user_transaction_defaults (
    user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    type            public.transaction_type NOT NULL,
    category_id     UUID REFERENCES public.categories (id) ON DELETE SET NULL,
    bank_account_id UUID REFERENCES public.bank_accounts (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, type)
);
```

Follow the boilerplate documented in `docs/database/schema-and-migrations.md`:

- `ENABLE ROW LEVEL SECURITY` plus the standard four policies named `user_transaction_defaults_{select,insert,update,delete}`, each predicated on `user_id = (SELECT auth.uid())`. Copy the shape from `supabase/migrations/20260425000002_add_user_settings.sql`.
- `BEFORE INSERT` trigger calling `public.tg_set_user_id()`, `BEFORE UPDATE` trigger calling `public.tg_set_updated_at()`.

**Referential validation trigger.** FKs alone are not enough — they don't check ownership, don't check that the category's `type` matches the row's `type`, and don't fire on soft delete. Add a `BEFORE INSERT OR UPDATE` trigger following the `check_transaction_bank_account` idiom (compare against `NEW.user_id`, not `auth.uid()`), raising `ERRCODE = '23514'`:

- `category_id`, when not null: must exist in `public.categories` with `user_id = NEW.user_id AND type = NEW.type AND deleted_at IS NULL`.
- `bank_account_id`, when not null: must exist in `public.bank_accounts` with `user_id = NEW.user_id AND deleted_at IS NULL`.

> ⚠️ **Trigger naming matters here.** Postgres fires same-timing triggers in alphabetical order, so the validation trigger must sort *after* `set_user_id_on_user_transaction_defaults` or it will read a null `NEW.user_id`. Name it `validate_user_transaction_defaults_refs` (`v` > `s`) — a `check_*` name would run first and break.

**`reset_user_data`.** `CREATE OR REPLACE` it (current definition: `supabase/migrations/20260321134117_reset_user_data_delete_budgets.sql`) to also `DELETE FROM public.user_transaction_defaults WHERE user_id = v_uid;` and clear `user_settings.default_transaction_type`. The `ON DELETE SET NULL` FKs mean the reset wouldn't error without this, but it would leave the user pointing at defaults whose categories no longer exist. Keep the returned JSON shape unchanged (no new count key) so `DataResetSection` needs no edit; update the function's `COMMENT` to mention the cleared defaults.

### 2b. Types

Run `supabase gen types typescript --local > types.gen.ts` at the repo root, then manually sync the new table and column into `apps/web-next/src/types/database.types.ts` — per `docs/superpowers/plans/2026-07-25-deep-code-review-fixes.md` these two are not auto-synced, and the checked-in file has known pre-existing drift (`transactions.user_id` nullability) that must be left alone.

### 2c. Read/write layer

New `apps/web-next/src/hooks/useTransactionDefaults.ts`, exported from `hooks/index.ts`:

- Reads via Refine `useList({ resource: "user_transaction_defaults", pagination: { mode: "off" } })`, returning a `Record<TransactionType, { categoryId, bankAccountId }>` shape, plus the default type.
- Writes via `supabaseClient.from("user_transaction_defaults").upsert({ type, category_id, bank_account_id }, { onConflict: "user_id,type" })`, followed by `useInvalidate()`. This mirrors `CurrencyContextProvider.setCurrency` (`contexts/currency/index.tsx:88-103`), which relies on the same trigger-populated `user_id` during conflict arbitration. Direct `supabaseClient` use rather than Refine mutations because the table has a composite PK and no `id` column, which Refine's Supabase provider assumes.
- `default_transaction_type` reads/writes go to `user_settings` using the same upsert pattern already used for currency.

### 2d. Settings UI

`apps/web-next/src/pages/settings/index.tsx` — new `TransactionDefaultsSection` component and a new `"transactions"` tab inserted between `general` and `import-export` in the `Tabs` `items` array (line 549+):

```
Settings
[ General | Transactions | Import & Export | ⚠ Danger Zone ]

┌ Transaction Defaults ─────────────────────────┐
│ Default type:  [ Spend           ▾]           │
│                                               │
│ Type   Default Category    Default Account    │
│ Earn   [ Salary       ▾]   [ Monzo       ▾]   │
│ Spend  [ Food/Grocer. ▾]   [ Amex        ▾]   │
│ Save   [ Emergency f. ▾]   [ Vanguard    ▾]   │
└───────────────────────────────────────────────┘
```

- One row per entry in `TRANSACTION_TYPES` (`constants/transactionTypes.ts`), labelled via `TRANSACTION_TYPE_LABELS`.
- Category options: `categories_with_usage` filtered by that row's type, then the existing helpers from `utility/categoryHierarchy.ts` — `isLeafCategory`, `compareCategoriesByHierarchyLabel`, `categoryLabel`, `categorySearchText` — exactly as `transactions/create.tsx:68-75` already does. Defaults may only point at leaf categories, consistent with the Create form.
- Bank account options: `bank_accounts_with_usage`, sorted by name.
- All three selects `allowClear`, so a default can be removed.
- **Stale-reference guard:** only pass `value` to a `Select` when the stored id is present in that select's loaded options. The `*_with_usage` views already exclude soft-deleted rows, so a soft-deleted default renders as empty rather than as a raw UUID. (The `ON DELETE SET NULL` FKs only cover hard deletes; the app soft-deletes.)

### 2e. Create form prefill

`apps/web-next/src/pages/transactions/create.tsx`:

- Initial `type` becomes the `?type=` param (existing `initialType` memo) **falling back to** the stored default type.
- A `useEffect` keyed on the resolved type, the loaded option lists, and the defaults: when `category_id` / `bank_account_id` are currently empty, set them from that type's defaults — but only if the id is present in the corresponding loaded options list (same stale guard as above).
- Extend the Type `Select`'s existing `onChange` (lines 113-115, currently clears `category_id`) to clear `bank_account_id` too. Both fields then re-derive from the new type's defaults via the effect.

> **Behaviour note:** switching Type mid-entry discards an already-chosen Bank Account, the way it already discards the chosen Category. This keeps the rule simple and predictable ("Type drives both") and avoids touched-state tracking. Type switches mid-entry are rare.

---

## 3. Export date-range presets

`apps/web-next/src/utility/dateRanges.ts` — add `getExportRangePresets()` returning AntD `presets` entries: This month, Last month, Last 3 months, This year, Last year, Last 12 months. Export from `utility/index.ts`.

Export it as a **function**, not a module-level constant, so "today" is evaluated per render. `constants/dateOptions.ts` already demonstrates the constant form's bug — its `currentYear` is frozen at module load and goes stale in a long-lived tab.

Wire into `ExportSection` in `pages/settings/index.tsx:373-379`: `<DatePicker.RangePicker presets={getExportRangePresets()} ... />`. The existing `onChange` handler already sets `range`, which un-disables the Export button, so preset clicks work with no further change.

---

## Implementation order

- [x] 1. Migration: `user_settings.default_transaction_type`, `user_transaction_defaults` table, RLS, triggers, `reset_user_data` update. Apply with `supabase migration up`.
- [x] 2. pgTAP suite `supabase/tests/user_transaction_defaults_rls_test.sql`; `supabase test db` green.
- [x] 3. Regenerate `types.gen.ts` and manually sync `apps/web-next/src/types/database.types.ts`.
- [x] 4. `useTransactionDefaults` hook + `hooks/index.ts` export.
- [x] 5. Settings → Transactions tab (`TransactionDefaultsSection`).
- [x] 6. Create form: default date, default type, prefill effect, Type `onChange` clearing both fields.
- [x] 7. `getExportRangePresets()` + wire into `ExportSection`.
- [x] 8. E2E tests (including the `settings-tabs.spec.ts` update); `npm run test:e2e:ci` green.

## Critical files

- `apps/web-next/src/pages/transactions/create.tsx` — all of step 1 and the prefill in step 2e.
- `apps/web-next/src/pages/settings/index.tsx` — new tab (2d) and export presets (3).
- `apps/web-next/src/contexts/currency/index.tsx` — the precedent for reading/writing `user_settings` and for the trigger-populated-`user_id` upsert pattern.
- `supabase/migrations/20260425000002_add_user_settings.sql` — RLS/trigger boilerplate to copy.
- `supabase/migrations/20260321134117_reset_user_data_delete_budgets.sql` — current `reset_user_data` body to `CREATE OR REPLACE`.
- `apps/web-next/src/utility/categoryHierarchy.ts` — leaf filtering, labelling and sort helpers to reuse rather than reimplement.
- `apps/web-next/e2e/tests/settings-tabs.spec.ts` — asserts the current three-tab set; **will fail** until updated.

## Verification plan

1. `supabase migration up` — migration applies cleanly.
2. `supabase test db` — new suite asserts: RLS isolation between two users; a category belonging to another user is rejected; a category whose `type` differs from the row's `type` is rejected; a soft-deleted category is rejected; `reset_user_data` clears the rows.
3. `cd apps/web-next && npm run check-types && npm run lint`.
4. `npm run test:e2e:ci`, covering:
   - `transactions.spec.ts` — Create opens with today's date; after setting defaults, Create pre-fills Category + Bank Account; switching Type swaps both to the new type's defaults.
   - `transaction-defaults.spec.ts` (new) — set/clear defaults in the Settings tab, confirm they persist across reload.
   - `transactions-export.spec.ts` — clicking the "Last month" preset populates the range and enables Export (reuse the page objects from the existing `fillExportDateRange` helper).
   - `settings-tabs.spec.ts` — updated for the four-tab set.
5. Manual smoke: `npm run dev` → Settings → Transactions, set a default per type → `/transactions/create` **from the sidebar** (not the list, to exercise the no-`?type=` path) → confirm Date/Type/Category/Bank Account all pre-filled → Settings → Import & Export → click "Last month" → Export.

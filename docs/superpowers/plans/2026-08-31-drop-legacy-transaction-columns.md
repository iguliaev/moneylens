# Drop legacy `transactions` denormalized columns — implementation plan

**Date:** 2026-08-31
**Status:** Implemented on branch `drop-legacy-transaction-columns` (pending PR). Pre-flight prod audit (step 1) still owed — see Progress Log.
**Issue:** _(not yet filed — worth one GitHub issue for the whole plan if we want "Closes #N" on the PR)_
**Source:** Research done 2026-08-31 (this doc). Related prior write-ups:
- `docs/superpowers/specs/2026-04-18-backend-db-plan.md` §2.6 (dual tag storage)
- `docs/superpowers/plans/2026-07-25-deep-code-review-fixes.md` §6 (legacy denormalized columns cleanup) — the `tags_with_usage` bug noted there is fixed as part of this plan
- `docs/improvement-roadmap.md` → "Known Architectural Tradeoffs" bullet

**Scope:**
In — permanently remove three legacy denormalized columns from `public.transactions`: `category` (TEXT), `bank_account` (TEXT), `tags` (TEXT[]); rewire the DB objects that still reference `tags`; drop the unused `sum_transactions_amount` RPC; update seeds, pgTAP tests, generated types, and docs.
Out — no change to the FK columns (`category_id`, `bank_account_id`), the `transaction_tags` junction, the JSON export/import contract (which keeps `category` / `bank_account` / `tags` as *name*-valued keys), or any UI behavior beyond `tags_with_usage.in_use_count` becoming correct.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-08-31 (impl)** — Implemented on branch `drop-legacy-transaction-columns`. Migration `20260831190631_drop_legacy_transaction_denormalized_columns.sql` drops the trigger/function `enforce_known_tags`, the unused `sum_transactions_amount` RPC, the three per-type views `transactions_spend`/`transactions_earn`/`transactions_save` (**not in the original plan** — found via `pg_depend`; they still `SELECT COALESCE(t.category, c.name)` etc. and have zero readers anywhere, so dropped rather than rewritten), redefines `tags_with_usage` onto the `transaction_tags` junction, redefines `bulk_insert_transactions` without the `tags` dual-write, then `ALTER TABLE ... DROP COLUMN category, bank_account, tags`. Seeds rewritten to attach one junction tag per seeded transaction (random pick via `ORDER BY random() LIMIT 1`, since an inline random array index re-evaluated per candidate row only linked ~65%). pgTAP: deleted `sum_transactions_amount_fn_test.sql`, rewrote `tags_rls_and_usage_test.sql` (11 tests, junction-based), stripped legacy columns from `transactions_rls_test.sql` / `reset_user_data_test.sql` / `aggregation_logic_test.sql`, trimmed the dead user2 tag CTE + stale `enforce_known_tags` comments from `budget_progress_test.sql` / `aggregation_logic_test.sql`, and fixed `bulk_insert_test.sql` test 2 (was `SELECT tags FROM transactions` — **the plan wrongly said this file was clean**). `supabase test db` green, `supabase db reset` clean, `npm run check-types` + `npm run lint` clean. Types regenerated (`types.gen.ts` −189 lines) and `database.types.ts` hand-synced via prettier. Docs updated (this file, `docs/domain/transactions.md`, `docs/improvement-roadmap.md`, backend-db-plan §2.6, deep-code-review §1 follow-up note).
- **2026-08-31 (still owed)** — Step 1 pre-flight audit against **production** (`SELECT count(*) ... WHERE tags/category/bank_account IS NOT NULL`) was **not run** — the sandbox blocked the outbound psql connection to the prod host. Must be run by a human before merge/deploy; if `tags` is non-zero, a backfill-into-`transaction_tags` migration has to land first.
- **2026-08-31** — Plan created from research. Not started. Key finding: `category` and `bank_account` (TEXT) have zero live dependencies and are safe to drop outright; `tags` (TEXT[]) has 5 live dependents (`tags_with_usage` view, `enforce_known_tags` trigger, `bulk_insert_transactions`, `sum_transactions_amount`, dev seed) that must be changed in the same migration/PR.

---

## Background: what is actually being removed

`public.transactions` carries two parallel sets of these fields. Only the legacy denormalized set is dead:

| Column | Role | Status |
|---|---|---|
| `category_id` uuid FK → `categories` | real category link | **keep** |
| `category` TEXT | `-- Obsolete field, do not use` (predates `category_id`) | **remove — no live refs** |
| `bank_account_id` uuid FK → `bank_accounts` | real bank-account link | **keep** |
| `bank_account` TEXT | `-- Obsolete field, do not use` | **remove — no live refs** |
| `transaction_tags` junction | real tags system | **keep** |
| `tags` TEXT[] | legacy denormalized array, never commented obsolete | **remove — 5 live dependents first** |

Defined in `supabase/migrations/20260201164000_baseline_from_schemas.sql` (transactions table, lines ~127–145).

### `category` (TEXT) / `bank_account` (TEXT) — verified clean

- Every view that once did `COALESCE(t.category, c.name)` / `COALESCE(t.bank_account, b.name)` (`transactions_with_details`, `view_monthly_category_totals`, `view_yearly_category_totals`) was **rewritten to use `category_id` joins** in `20260627120000_transaction_category_parent_labels.sql` and `20260627130740_fix_category_totals_views_include_parent_name.sql`. Current definitions do not reference the legacy columns.
- No trigger (`check_transaction_category_type`, `check_transaction_bank_account` both use `*_id`), no index, no CHECK constraint references them.
- `apps/web-next/src`: only present in generated types. `transactions/edit.tsx` does `select: "*"` which over-fetches them but reads nothing from them.
- `e2e/`: no dependency. `transactions-export.spec.ts:267` already asserts the export row has **no** `bank_account` property.
- The JSON export/import `category` / `bank_account` keys are *name strings* produced from `transactions_with_details.category_name` / `bank_account_name` (`apps/web-next/src/utility/jsonExport.ts`) and consumed by `bulk_insert_transactions`' name lookup — unrelated to the physical columns, unchanged.

### `tags` (TEXT[]) — live dependents

1. **`tags_with_usage` view** — latest definition is in `20260227201422_add_soft_delete.sql` (lines ~510–542) and still computes `in_use_count` via `CROSS JOIN LATERAL UNNEST(tr.tags)`. Because nothing writes the legacy array in prod, this count is effectively **always 0** — an existing latent bug (see deep-code-review §6). The view is read by 6 frontend call sites: `pages/tags/list.tsx`, `pages/transactions/{list,create,edit}.tsx`, `pages/budgets/{create,edit}.tsx`, plus `utility/exportMetadata.ts`.
2. **`enforce_known_tags()` + trigger `enforce_known_tags_trg`** — `BEFORE INSERT OR UPDATE ON public.transactions`, validates `NEW.tags` against the user's tag dictionary. No-op when `NEW.tags IS NULL` (the current reality). Defined in baseline (~lines 1055–1089), never redefined.
3. **`bulk_insert_transactions(jsonb)`** — latest definition `20260729212856_bulk_insert_hierarchical_category_path.sql` (INSERT column list ~lines 217–238) still **dual-writes** `transactions.tags` from the JSON `tags` array *in addition to* inserting `transaction_tags` rows.
4. **`sum_transactions_amount(date, date, transaction_type, uuid, text, text[], text[])`** — baseline (~lines 1018–1052), never redefined. Params `p_bank_account` / `p_tags_any` / `p_tags_all` filter on `t.bank_account` and `t.tags`. **Not called anywhere in `apps/web-next/src`** (grep: only appears in generated types). Has a dedicated pgTAP test.
5. **`supabase/seeds/transactions.sql`** — all three seed INSERTs write `tags` (array literal) and `bank_account` (text), and never populate `transaction_tags`.

`create_transaction_with_tags`, `update_transaction_with_tags`, `delete_tag_safe`, `delete_category_safe`, `delete_bank_account_safe` are already clean (verified).

---

## 1. Migration: drop the columns and rewire `tags` dependents

New file via `supabase migration new drop_legacy_transaction_denormalized_columns`.

Order inside the migration matters — the column drop must come **after** nothing depends on it:

1. **Drop the tag-validation trigger + function** (no longer meaningful; `bulk_insert_transactions` does its own tag existence check, and the atomic RPCs validate tag ownership):
   ```sql
   DROP TRIGGER IF EXISTS enforce_known_tags_trg ON public.transactions;
   DROP FUNCTION IF EXISTS public.enforce_known_tags();
   ```
2. **Drop the unused RPC** (and its GRANT goes with it):
   ```sql
   DROP FUNCTION IF EXISTS public.sum_transactions_amount(
     date, date, public.transaction_type, uuid, text, text[], text[]
   );
   ```
   If we would rather keep a "sum with filters" RPC for future use, instead `CREATE OR REPLACE` it with `p_bank_account_id uuid` and a `transaction_tags` EXISTS/`ALL` subquery — but there is no current caller, so **dropping is recommended**.
3. **Redefine `tags_with_usage`** to compute `in_use_count` from `transaction_tags`, mirroring `delete_tag_safe`'s counting logic, and keeping `WITH (security_invoker = true)` and the `deleted_at IS NULL` filters on both `tags` and `transactions`:
   ```sql
   CREATE OR REPLACE VIEW public.tags_with_usage
   WITH (security_invoker = true) AS
   SELECT g.id, g.user_id, g.name, g.description, g.created_at, g.updated_at,
          COALESCE(u.cnt, 0)::bigint AS in_use_count
   FROM public.tags g
   LEFT JOIN (
     SELECT tt.tag_id, count(*)::bigint AS cnt
     FROM public.transaction_tags tt
     JOIN public.transactions t ON t.id = tt.transaction_id AND t.deleted_at IS NULL
     GROUP BY tt.tag_id
   ) u ON u.tag_id = g.id
   WHERE g.deleted_at IS NULL;
   ```
   Keep the existing `COMMENT ON VIEW`. Note the join key changes from `u.tag = g.name` to `u.tag_id = g.id`.
4. **Redefine `bulk_insert_transactions(jsonb)`** — copy the full body from `20260729212856_bulk_insert_hierarchical_category_path.sql` verbatim and remove `tags` from the `INSERT INTO public.transactions (...)` column list and its corresponding `VALUES` expression (the `CASE WHEN v_tx->'tags' ... array_agg ...` block). Everything else — required-field checks, type validation, category-path resolution, per-tag existence check, the `INSERT INTO public.transaction_tags` block, the sanitized `EXCEPTION` handler — stays byte-for-byte. Re-`GRANT EXECUTE ... TO authenticated` if the recreate drops it (it shouldn't with `CREATE OR REPLACE`, but confirm).
5. **Drop the columns**, now unreferenced:
   ```sql
   ALTER TABLE public.transactions
     DROP COLUMN category,
     DROP COLUMN bank_account,
     DROP COLUMN tags;
   ```

Follow the repo migration conventions in `docs/database/schema-and-migrations.md` (header comment explaining *why*, schema-qualified names, `security_invoker` on views, hardened `search_path` on functions).

---

## 2. Rewrite `supabase/seeds/transactions.sql`

Current file writes `tags` + `bank_account` and skips `transaction_tags`. Rework so that:
- the transactions INSERTs use only `(id, user_id, date, type, category_id, amount, notes, bank_account_id)`;
- a follow-up step inserts `transaction_tags` rows, picking 1 tag per transaction from the same pools currently used for the array literal (`groceries`/`movie`/`bus`/`doctor`/`clothes` for spend, etc.), joined to `public.tags` by `(user_id, name)` — `supabase/seeds/tags.sql` already guarantees those tag rows exist for `user@example.com`.

This makes local dev data exercise the real tag system (tag filters, tag charts, `tags_with_usage` counts) which it currently does not.

---

## 3. pgTAP test updates

Run `supabase test db` after each edit; adjust `select plan(N)` where assertions are added/removed.

| File | Change |
|---|---|
| `supabase/tests/sum_transactions_amount_fn_test.sql` | **Delete the file** (function is gone). Remove it from any test manifest/runner list if one exists. |
| `supabase/tests/tags_rls_and_usage_test.sql` | **Rewrite.** Seed rows currently inserted as `transactions (user_id, date, type, amount, tags, bank_account)` must instead insert a transaction (no `tags`/`bank_account`) then `transaction_tags` rows. Assertions on `tags_with_usage` counts and `delete_tag_safe` stay, but now reflect junction-based counts. Drop the local `delete_tag_safe` override shim if it's now redundant with the shipped `RETURN NEXT` version. |
| `supabase/tests/transactions_rls_test.sql` | Remove `category`, `tags`, `bank_account` from ~6 `insert into transactions (...)` column lists and their value tuples (lines ~32–35, 52–53, 60–61, 104–105, 155–156, 166–167). Tests 1–12 assert counts / RLS / `user_id` NOT NULL / `category_id` ownership / cascade — unaffected. The tag pre-seeding (lines 12–18) that only existed to satisfy `enforce_known_tags` can be trimmed to whatever the junction tests still need. |
| `supabase/tests/reset_user_data_test.sql` | Drop `tags` from the two `insert into public.transactions (... category_id, bank_account_id, tags)` lists (lines 59, 95). |
| `supabase/tests/aggregation_logic_test.sql` | Drop the stray `bank_account` column + `'Test Bank'` value from the seed INSERT at line ~55. Its `tags`-column assertions read `view_monthly/yearly_tagged_type_totals` / `view_tagged_type_totals`, which are all `transaction_tags`-derived — **no logic change**. |
| `supabase/tests/budget_progress_test.sql` | Comment at line ~33 references `enforce_known_tags`; the inserts don't use a `tags` column so there's no functional change. Update/remove the stale comment (and the user2 tag seeding if it existed only for that trigger). |

No other pgTAP files touch the legacy columns (`bank_accounts_usage_and_rpc_test.sql`, `transaction_tags_test.sql`, `bulk_insert_test.sql`, `bulk_upload_entities_test.sql` use `_id` columns or JSON-payload keys).

---

## 4. Regenerate types

Per `docs/database/schema-and-migrations.md`:
```bash
supabase gen types typescript --local > types.gen.ts
```
Then hand-sync `apps/web-next/src/types/database.types.ts` (not auto-synced in this repo — same manual step as `2026-07-25-deep-code-review-fixes.md` step 2):
- `transactions` Row/Insert/Update: drop `category`, `bank_account`, `tags`.
- All view types that surface those fields (`transactions_with_details` and friends already don't in their live form, but the checked-in file may carry stale entries — reconcile against generated output).
- `create_transaction_with_tags` / `update_transaction_with_tags` Returns rows: drop `category`, `bank_account`, `tags`.
- Remove the `sum_transactions_amount` function entry entirely.
- Leave the known pre-existing `transactions.user_id` nullability drift untouched (out of scope, noted in the earlier plan).

Optional tidy: narrow `transactions/edit.tsx` `select: "*, transaction_tags(tag_id), category:categories(id, name)"` to an explicit column list now that `*` no longer includes the legacy fields — low value, skip unless touching that file anyway.

`npm run check-types` and `npm run lint` in `apps/web-next` must be clean.

---

## 5. Docs

| File | Change |
|---|---|
| `docs/domain/transactions.md` | Delete the paragraph "Table: `public.transactions`. Two columns, `category` (text) and `bank_account` (text), still exist…". The `tags` row in the column table already says "Via the `transaction_tags` junction table, not a column." — leave it, it's now unambiguously true. |
| `docs/improvement-roadmap.md` | Remove the "Dual tag storage: `transactions.tags TEXT[]` column still exists…" bullet under "Known Architectural Tradeoffs" (or move to a "Done" section with the PR link). |
| `docs/superpowers/specs/2026-04-18-backend-db-plan.md` | §2.6 and the priority-matrix row for 2.6 → mark resolved, cross-ref this plan / PR. |
| `docs/superpowers/plans/2026-07-25-deep-code-review-fixes.md` | §6 (legacy denormalized columns cleanup) and the `tags_with_usage.in_use_count` follow-up note in §5 → mark done, cross-ref. |

---

## Implementation order

- [ ] 1. Pre-flight audit on **production**: `SELECT count(*) FROM public.transactions WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;` and the same for `category IS NOT NULL` / `bank_account IS NOT NULL`. Expect 0. If non-zero for `tags`, backfill into `transaction_tags` in a prior migration before proceeding. **NOT DONE — sandbox blocked the prod psql connection; a human must run this before merge.**
- [x] 2. Write the migration (§1) — trigger/function drops, RPC drop, per-type view drops (added), `tags_with_usage` redefine, `bulk_insert_transactions` redefine, `ALTER TABLE ... DROP COLUMN` last.
- [x] 3. `supabase db reset` locally; applies clean.
- [x] 4. Rewrite `supabase/seeds/transactions.sql` (§2); re-reset, verified 100 txns / 100 `transaction_tags` rows (one tag each).
- [x] 5. Update pgTAP tests (§3) — plus `bulk_insert_test.sql` (missed by the plan); `supabase test db` green.
- [x] 6. Regenerate + hand-sync types (§4); `npm run check-types` + `npm run lint` green in `apps/web-next`.
- [x] 7. Update docs (§5).
- [ ] 8. Run affected e2e specs (§ Verification).
- [ ] 9. PR via the `create-pull-request` skill.

## Critical files

- `supabase/migrations/20260201164000_baseline_from_schemas.sql` — original column defs, `enforce_known_tags`, `sum_transactions_amount` (reference only; never edit a merged migration).
- `supabase/migrations/20260227201422_add_soft_delete.sql` — current `tags_with_usage` definition to supersede.
- `supabase/migrations/20260729212856_bulk_insert_hierarchical_category_path.sql` — current `bulk_insert_transactions` body to copy + trim.
- `supabase/seeds/transactions.sql` — rewrite.
- `supabase/tests/{sum_transactions_amount_fn_test,tags_rls_and_usage_test,transactions_rls_test,reset_user_data_test,aggregation_logic_test,budget_progress_test}.sql` — test edits.
- `types.gen.ts`, `apps/web-next/src/types/database.types.ts` — regenerate + hand-sync.
- `apps/web-next/src/utility/jsonExport.ts`, `exportMetadata.ts` — read only; confirm no regression (they already use `*_name` / `tag_names`).

## Verification plan

1. `supabase db reset` — migration + seeds apply with no error.
2. `supabase test db` — all pgTAP green; `tags_with_usage` counts now reflect `transaction_tags`.
3. `cd apps/web-next && npm run check-types && npm run lint` — clean.
4. `npm run test:e2e:ci -- e2e/tests/transactions.spec.ts` — CRUD + tag selection.
5. `npm run test:e2e:ci -- e2e/tests/bulk-upload.spec.ts` — import still creates `transaction_tags` rows; no reference to a dropped column.
6. `npm run test:e2e:ci -- e2e/tests/transactions-export.spec.ts` — export unchanged (still emits `category` / `tags` name keys, still omits `bank_account`).
7. `npm run test:e2e:ci -- e2e/tests/data-reset-isolation.spec.ts` — reset path unaffected.
8. Manual: open Tags list — usage counts are non-zero for tags actually used via the junction, and a tag that's in use cannot be deleted.
9. `psql` against local: `\d public.transactions` shows the three columns gone; `\d+ public.tags_with_usage` shows the new junction-based body.

## Rollback / risk notes

- Dropping columns is irreversible once merged; a revert migration would re-add empty columns only. The pre-flight audit (step 1) is the safety gate.
- Only user-visible change: `tags_with_usage.in_use_count` goes from ~always-0 to correct — this makes the Tags list and `delete_tag_safe` agree. It's a fix; call it out in the PR description in case anyone relied on always-deletable tags.
- `sum_transactions_amount` removal: confirmed no `apps/web-next/src` caller. If an external script or Supabase dashboard query uses it, that would 404 post-deploy — low likelihood, worth a one-line mention in the PR.
- Staging deploy (merge to `main`) exercises the migration against staging data before `release`.

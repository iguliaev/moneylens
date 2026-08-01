# JSON category hierarchy in bulk import + export — implementation plan

**Date:** 2026-08-01
**Status:** Implemented, PR open
**Source:** Follow-up to [`2026-07-29-json-export-and-leaf-category-fix.md`](2026-07-29-json-export-and-leaf-category-fix.md), which fixed `bulk_insert_transactions`' ambiguous category lookup and shipped JSON export, but explicitly left a "Known limitation": `insert_categories` (the `categories` section of `bulk_upload_data`) can only create **root-level** categories — a transaction referencing a `"Parent/Child"` category path only resolves if *both* categories already exist beforehand. JSON export also never emitted a `categories` section, so an export could never fully round-trip into an empty account when nested categories were involved.
**Scope:** Let `insert_categories` create a parent category on demand via a new optional `parent` field, and have JSON export emit an explicit `categories` section (with the same `parent` field) alongside `transactions`, so a JSON export is always self-contained and re-importable into an empty account — including nested categories — with zero manual setup. CSV is out of scope (there is no CSV import feature; CSV export's inline `"Parent/Child"` transaction-category string is unaffected).

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-08-01** — Implemented Tasks 1–5. Migration `20260801103000_insert_categories_parent_field.sql` lands the `parent`-field nested-category resolution rule with 8 new pgTAP assertions (Tests 24–31, 31/31 total in `bulk_upload_entities_test.sql`, 255/255 overall). `jsonExport.ts` gained `collectJsonExportCategories`/`JsonExportCategory` and `buildJsonExport` now always emits a `categories` section (18/18 Vitest in `jsonExport.test.ts`). `rpc.ts`'s `CategoryInput` gained `parent`. Added e2e coverage: a new `bulk-upload.spec.ts` case uploads a nested category + same-payload transaction and verifies the DB tree and transaction resolution; `transactions-export.spec.ts`'s JSON test now asserts on the exported `categories` array. `docs/api/bulk-upload.md` updated with the `parent` field, auto-vivify behavior, 2-level-cap error, and FAQ. Full regression: 255/255 pgTAP, 38/38 Vitest, 109/109 Playwright e2e, lint and type-check clean. Opened PR.

---

## Decisions locked in with the user

- **Category schema:** categories gain an optional `parent` field holding the bare parent category name (same `type`), e.g. `{ "type": "spend", "name": "Eating out", "parent": "Food" }`. `name` stays a plain leaf name — never a `"Parent/Child"` path. This is a **different, additional** convention from the pre-existing `"Parent/Child"` path string already used by a transaction's own `category` field (`bulk_insert_transactions`, unchanged) — the two live in different parts of the payload and don't conflict.
- **Missing parent → auto-create:** if a nested category's `parent` name doesn't already exist (in the DB or as a root entry elsewhere in the same payload), `insert_categories` silently creates it as a root category (no description) alongside the child. This guarantees every JSON export is re-importable into an empty account with one call.
- **Export always includes `categories`:** every JSON export gets a `categories` array of all distinct `(type, name, parent?)` triples used by the exported rows, even when nothing is nested (array may be empty, but the key is always present). `buildJsonExport`'s output shape changes from `{ transactions }` to `{ categories, transactions }` — this is a breaking shape change to the JSON export format, acceptable since export/import both live in this codebase and ship together.
- **2-level cap enforcement:** the schema caps hierarchy at 2 levels (`trg_validate_category_parent`, `20260601210000_add_category_hierarchy.sql`). If a name is used as a `parent` by one entry *and* itself has a non-empty `parent` in the same batch (an attempted 3-level chain), the whole batch is rejected with a clear validation error rather than silently creating a confusing duplicate root.
- Explicit root entries win over auto-vivified ones: if a name appears both as an explicit root entry (with its own `description`) and as an auto-derived parent (from some other entry's `parent` field), the explicit entry's data is what gets inserted.

**Tech Stack:** PostgreSQL/PL-pgSQL (Supabase migrations + pgTAP), TypeScript, Vitest, Playwright E2E.

---

### Task 1: Extend `insert_categories` to support nested category creation

**Files:**
- Create: `supabase/migrations/20260801103000_insert_categories_parent_field.sql`
- Modify: `supabase/tests/bulk_upload_entities_test.sql`

Current function (`insert_categories(p_user_id uuid, p_categories jsonb) RETURNS int`, last touched by `20260719162135_sanitize_bulk_upload_errors.sql`) only ever inserts root-level rows: `INSERT INTO categories (user_id, type, name, description) SELECT ... ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING`.

New body, `CREATE OR REPLACE FUNCTION insert_categories`, keeps the existing auth checks, the existing "missing name/type" and "invalid transaction_type" whole-batch validations verbatim, and the existing sanitized `EXCEPTION` handler (`WHEN SQLSTATE 'P0001' THEN RAISE; WHEN others THEN RAISE EXCEPTION 'insert_categories failed' USING ERRCODE = SQLSTATE;`). Adds:

1. **New validation** — reject a batch where some name is both referenced as a `parent` and itself carries a non-empty `parent` (3-level attempt):
   ```sql
   SELECT p.name INTO v_conflict_name
   FROM (
     SELECT DISTINCT (elem->>'type') AS typ, trim(elem->>'parent') AS name
     FROM jsonb_array_elements(p_categories) AS elem
     WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
   ) p
   JOIN (
     SELECT DISTINCT (elem->>'type') AS typ, elem->>'name' AS name
     FROM jsonb_array_elements(p_categories) AS elem
     WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
   ) c ON c.typ = p.typ AND c.name = p.name
   LIMIT 1;

   IF v_conflict_name IS NOT NULL THEN
     RAISE EXCEPTION 'insert_categories: category "%" cannot be both a parent and a child in the same batch (max 2 levels)', v_conflict_name;
   END IF;
   ```

2. **Phase 1 — root categories** (replaces the old single INSERT): explicit entries with no `parent`, unioned with every distinct `parent` name referenced by a nested entry (auto-vivified, `description = NULL`). `DISTINCT ON (t, n)` with a `priority` column (`0` = explicit, `1` = auto-derived) makes explicit entries win when both exist for the same `(type, name)`:
   ```sql
   INSERT INTO public.categories (user_id, type, name, description)
   SELECT p_user_id, t, n, d
   FROM (
     SELECT DISTINCT ON (t, n) t, n, d
     FROM (
       SELECT (elem->>'type')::public.transaction_type AS t, elem->>'name' AS n,
              elem->>'description' AS d, 0 AS priority
       FROM jsonb_array_elements(p_categories) AS elem
       WHERE elem->>'parent' IS NULL OR trim(elem->>'parent') = ''
       UNION ALL
       SELECT (elem->>'type')::public.transaction_type AS t, trim(elem->>'parent') AS n,
              NULL::text AS d, 1 AS priority
       FROM jsonb_array_elements(p_categories) AS elem
       WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
     ) combined
     ORDER BY t, n, priority
   ) roots
   ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

   GET DIAGNOSTICS v_root_inserted = ROW_COUNT;
   ```

3. **Phase 2 — nested categories**: for each entry with a non-empty `parent`, resolve `parent_id` against that user's root-level (`parent_id IS NULL`) category of the same type and name (guaranteed to exist after phase 1), then insert the child:
   ```sql
   INSERT INTO public.categories (user_id, type, name, description, parent_id)
   SELECT p_user_id, t, n, d, pid
   FROM (
     SELECT (elem->>'type')::public.transaction_type AS t, elem->>'name' AS n,
            elem->>'description' AS d,
            (SELECT c.id FROM public.categories c
             WHERE c.user_id = p_user_id
               AND c.type = (elem->>'type')::public.transaction_type
               AND c.name = trim(elem->>'parent')
               AND c.parent_id IS NULL
             LIMIT 1) AS pid
     FROM jsonb_array_elements(p_categories) AS elem
     WHERE elem->>'parent' IS NOT NULL AND trim(elem->>'parent') <> ''
   ) children
   WHERE pid IS NOT NULL
   ON CONFLICT ON CONSTRAINT unique_user_type_name DO NOTHING;

   GET DIAGNOSTICS v_child_inserted = ROW_COUNT;
   RETURN v_root_inserted + v_child_inserted;
   ```

Add a header comment above `CREATE OR REPLACE FUNCTION` explaining the two-phase rule (mirrors "Decisions locked in" above), and a `COMMENT ON FUNCTION insert_categories IS ...` describing the new `parent` field and auto-vivify behavior (there isn't one today — add it, following the pattern already used on `bulk_insert_transactions`).

**pgTAP** (`supabase/tests/bulk_upload_entities_test.sql`, currently `plan(23)`, tests 1–23, users `user1`–`user16`): bump to `plan(28)`, add users `user17`–`user21`, append after Test 23 (before `select * from finish();`):

- **Test 24** — nested category with auto-created parent: `insert_categories(user17, '[{"type":"spend","name":"Eating out","parent":"Food"}]')` returns `2`; assert a root "Food" (`parent_id IS NULL`) and a child "Eating out" (`parent_id` = Food's id) both exist.
- **Test 25** — nested category with pre-existing parent: seed root "Food" via direct `INSERT INTO categories` for `user18`, then `insert_categories(user18, '[{"type":"spend","name":"Eating out","parent":"Food"}]')` returns `1` (only the child); assert no duplicate "Food" root was created (`COUNT(*) WHERE name='Food' AND parent_id IS NULL` = 1).
- **Test 26** — idempotency: call the Test 24 payload again for `user17`; returns `0`.
- **Test 27** — 3-level chain rejected: `insert_categories(user19, '[{"type":"spend","name":"B","parent":"A"},{"type":"spend","name":"C","parent":"B"}]')` throws, message matches `%cannot be both a parent and a child%`.
- **Test 28** — `bulk_upload_data` end-to-end: a payload with `categories: [{"type":"spend","name":"Eating out","parent":"Food"}]` and `transactions: [{"date":"2026-05-01","type":"spend","amount":10,"category":"Food/Eating out"}]` in the **same call** for `user20` succeeds and `transactions_inserted = 1` — proves the "known limitation" from the previous plan is resolved (a `"Parent/Child"` transaction reference no longer requires the categories to pre-exist).

Run `supabase test db` before writing the migration (expect new assertions to fail against current behavior) and after (expect `28/28`).

---

### Task 2: JSON export emits a `categories` section

**Files:**
- Modify: `apps/web-next/src/utility/jsonExport.ts`
- Modify: `apps/web-next/src/utility/jsonExport.test.ts`

`jsonExport.ts` currently exports only `{ transactions: [...] }`. Add:

```ts
export interface JsonExportCategory {
  type: Database["public"]["Enums"]["transaction_type"];
  name: string;
  parent?: string;
}

export interface JsonExportPayload {
  categories: JsonExportCategory[];
  transactions: JsonExportTransaction[];
}

export const collectJsonExportCategories = (
  rows: TransactionExportRow[]
): JsonExportCategory[] => {
  const seen = new Map<string, JsonExportCategory>();
  for (const row of rows) {
    if (!row.category_name) continue;
    const category: JsonExportCategory = row.category_parent_name
      ? { type: row.type, name: row.category_name, parent: row.category_parent_name }
      : { type: row.type, name: row.category_name };
    const key = `${category.type}::${category.parent ?? ""}::${category.name}`;
    if (!seen.has(key)) seen.set(key, category);
  }
  return [...seen.values()].sort((a, b) =>
    a.type === b.type
      ? (a.parent ?? "").localeCompare(b.parent ?? "") || a.name.localeCompare(b.name)
      : a.type.localeCompare(b.type)
  );
};

export const buildJsonExport = (rows: TransactionExportRow[]): string => {
  const payload: JsonExportPayload = {
    categories: collectJsonExportCategories(rows),
    transactions: rows.map(transactionToJsonExportRow),
  };
  return JSON.stringify(payload, null, 2);
};
```

`transactionToJsonExportRow` (per-transaction `category: "Parent/Child"` string, via the existing `formatCategoryPath` from `csvExport.ts`) is **unchanged** — it's a separate convention consumed by `bulk_insert_transactions`, not `insert_categories`.

**Unit tests** (`jsonExport.test.ts`):
- Update the two existing `buildJsonExport` tests for the new `{ categories, transactions }` shape (the pretty-print test becomes `'{\n  "categories": [],\n  "transactions": []\n}'`).
- New `describe("collectJsonExportCategories")` block: dedupes repeated `(type, parent, name)` triples across rows; emits `{ type, name }` (no `parent` key) for root-level categories; emits `{ type, name, parent }` for nested; skips rows with `category_name: null`; sorts deterministically by `type`, then `parent`, then `name`.

---

### Task 3: Wire the `parent` field into the TypeScript RPC types

**Files:**
- Modify: `apps/web-next/src/utility/rpc.ts`

Add `parent?: string | null;` to `CategoryInput` (alongside `type`, `name`, `description`). No change needed in `apps/web-next/src/pages/settings/index.tsx`'s `parseUploadFile` — it already passes the parsed `categories` array through untouched, so it naturally carries whatever fields are present, including `parent`.

---

### Task 4: E2E coverage

**Files:**
- Modify: `apps/web-next/e2e/tests/bulk-upload.spec.ts`
- Modify: `apps/web-next/e2e/tests/transactions-export.spec.ts`

**`bulk-upload.spec.ts`** — new test, following the existing inline-buffer fixture pattern used by "bulk upload rejects transaction rows referencing parent categories" (same file, ~line 189): upload a JSON payload with `categories: [{ type: "spend", name: "Eating out", parent: "Food" }]` and a transaction with `category: "Food/Eating out"` in the same file; assert the success alert shows `2 categories inserted` and `1 transactions inserted`; verify via `supabaseAdmin` that a root "Food" and a child "Eating out" (with matching `parent_id`) both exist, and the transaction's `category_id` points at the child.

**`transactions-export.spec.ts`** — extend the existing "exports transactions in range as JSON..." test (~line 162, already seeds a `Transport` → `Taxi` parent/child pair): after parsing the downloaded JSON, additionally assert `parsed.categories` contains `{ type: "spend", name: "Taxi", parent: "Transport" }`.

---

### Task 5: Update `docs/api/bulk-upload.md`

**Files:**
- Modify: `docs/api/bulk-upload.md`

- **Category Input Schema**: add `parent?: string | null;` to the `CategoryInput` interface listing; document auto-create-missing-parent behavior and the 2-level-cap validation error, with an example nested-category payload.
- **Transaction Input Schema**, `category` field bullets: remove the line "insert_categories does not support setting parent_id" (no longer true) — replace with a note that a `"Parent/Child"` transaction reference can now be fully satisfied within the same payload via a `categories` section entry using the new `parent` field.
- **Category Errors (whole batch, not per-row)** table: add the new `%cannot be both a parent and a child in the same batch%` message row.
- **FAQ** ("Can I use this for data exports?"): update to mention JSON export now includes a `categories` section, making every export self-contained and re-importable into an empty account.
- Bump `**Last Updated**`.

---

## Implementation order

- [x] 1. `insert_categories` nested-creation migration + pgTAP (Task 1, backend correctness first, mirrors how the previous plan did the DB fix before the export change)
- [x] 2. RPC type update (Task 3, small, unblocks Task 2/4 type-checking)
- [x] 3. JSON export `categories` section + unit tests (Task 2)
- [x] 4. E2E coverage (Task 4)
- [x] 5. Docs (Task 5)
- [x] 6. Full regression pass, then open PR via the `create-pull-request` skill (never commit directly to `main`/`release` per `AGENTS.md`)

## Critical files

- `supabase/migrations/20260801103000_insert_categories_parent_field.sql` (new) — the nested-category resolution rule
- `supabase/tests/bulk_upload_entities_test.sql` — pgTAP coverage (Tests 24–28)
- `apps/web-next/src/utility/jsonExport.ts` — `categories` section + `collectJsonExportCategories`
- `apps/web-next/src/utility/rpc.ts` — `CategoryInput.parent`
- `apps/web-next/e2e/tests/bulk-upload.spec.ts`, `transactions-export.spec.ts` — E2E coverage
- `docs/api/bulk-upload.md` — public API docs

## Verification plan

1. `supabase test db` — pgTAP, `28/28` in `bulk_upload_entities_test.sql` (plus unaffected `bulk_insert_test.sql`).
2. `cd apps/web-next && npm run test:unit` — Vitest, including updated/new `jsonExport.test.ts` cases.
3. `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/bulk-upload.spec.ts e2e/tests/transactions-export.spec.ts`
4. `npm run lint && npm run check-types` — clean.
5. Manual: in the dev server, upload a JSON file whose only `categories` entry is `{"type":"spend","name":"Eating out","parent":"Food"}` into a fresh/reset account, confirm both categories appear in the category picker with the right nesting; then export JSON for a range containing a nested-category transaction and confirm the download has a top-level `categories` array with the right `parent` field, and re-upload that exact export into a freshly reset account to confirm it fully round-trips (no "not found" errors) in one call.

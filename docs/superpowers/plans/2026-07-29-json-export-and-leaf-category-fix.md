# JSON export + leaf-category-path fix — implementation plan

**Date:** 2026-07-29
**Status:** Not started
**Source:** [`2026-07-25-transactions-csv-export.md`](2026-07-25-transactions-csv-export.md) — "Future work" section
**Scope:** (A) Fix a latent bug in `bulk_insert_transactions` where bare category names can silently resolve to the wrong category once same-named leaves exist under different parents, by requiring `"Parent/Child"` paths for nested categories and narrowing bare-name resolution to root-level leaves only. (B) Add a JSON export option to the existing CSV export feature in Settings > Import & Export, reusing the existing format-agnostic fetch layer and emitting the same hierarchical `"Parent/Child"` category path CSV already uses — safe to round-trip through `bulk_insert_transactions` because of (A). Ships as **one PR**.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-07-29** — Plan designed and written. Not started.

---

## Context

This is the "future work" carved out at the bottom of `docs/superpowers/plans/2026-07-25-transactions-csv-export.md` (CSV export, already shipped in PR #253). That plan deliberately deferred JSON export and flagged a latent bug: `bulk_insert_transactions` resolves a transaction's `category` field by bare leaf name only (`c.name = v_tx->>'category'`, any depth, `LIMIT 1`), which became ambiguous once `20260627124710_fix_category_unique_constraint_include_parent_id.sql` allowed the same leaf name to exist under different parents (e.g. `Food/Other` and `Transport/Other`) — the bare lookup can silently pick the wrong one. JSON export's natural category representation is the same `"Parent/Child"` path CSV already uses, so it isn't safe to ship JSON export without fixing the backend's ambiguous resolution first — otherwise a user could export a category path that re-imports into the wrong category with no error. Both pieces land together in one PR.

**Architecture:** No new frontend data-fetching is needed — `fetchTransactionsForExport`/`TransactionExportRow` (`apps/web-next/src/utility/exportTransactions.ts`) is already format-agnostic; JSON export is purely a new serialization path (`jsonExport.ts`) alongside the existing `csvExport.ts`, sharing a small blob/anchor-click download helper. On the backend, `bulk_insert_transactions` gets a new category-resolution block (new migration, `CREATE OR REPLACE FUNCTION`) that parses an optional `"Parent/Child"` path instead of doing a bare, unqualified leaf-name lookup.

**Decisions locked in with the user:**
- **Category resolution rule (breaking-but-correct):** a `category` string containing `/` is split on the *first* `/` into `parent_part`/`child_part` (each trimmed) and resolved as an exact `Parent/Child` pair — no ambiguity possible, no leaf check needed (the schema's 2-level cap guarantees any category with a parent is a leaf — enforced by `trg_validate_category_parent`, `supabase/migrations/20260601210000_add_category_hierarchy.sql`). A bare name (no `/`) now resolves **only** against root-level (`parent_id IS NULL`) categories that are *also* leaves — narrower than the old behavior, which matched leaves at any depth. A category that has since been moved under a parent can no longer be referenced by its bare name; callers must switch to `"Parent/Child"`. This removes the ambiguity bug because root-leaf names are already unique per `user_id, type, name, parent_id IS NULL` (enforced by the existing `unique_user_type_name` constraint, `NULLS NOT DISTINCT`).
- **Shipping:** the backend fix and JSON export ship together in **one PR**, backend first (Task 1), since JSON export's category format assumes the fix.
- Confirmed via research: the frontend already restricts category *selection* on transactions to leaves only (`apps/web-next/src/utility/categoryHierarchy.ts` `isLeafCategory`/`leafCategoriesOnly`, used in `pages/transactions/create.tsx` and `edit.tsx`), but there is **no DB-level constraint** enforcing leaf-only `category_id` on `transactions` outside of `bulk_insert_transactions` itself — this migration remains the only backend guard for bulk/JSON import specifically.

**Tech Stack:** PostgreSQL/PL-pgSQL (Supabase migrations + pgTAP), TypeScript, Vitest, Ant Design 5 (`Segmented`), Playwright E2E.

---

### Task 1: Fix category resolution ambiguity in `bulk_insert_transactions`

**Files:**
- Create: `supabase/migrations/20260729130000_bulk_insert_hierarchical_category_path.sql`
- Modify: `supabase/tests/bulk_insert_test.sql`

- [ ] **Step 1: Add new failing pgTAP test cases to `bulk_insert_test.sql` (before the fix lands)**

Insert these new cases immediately before `SELECT extensions.finish();`. Use fresh category names (`Food`, `Travel`) rather than reusing the existing seeded `Transport` category, since `Transport` is already relied on as a bare-name leaf in Test 11.

```sql
-- Test 14: "Parent/Child" path resolves to the correct category among
-- same-named leaves under different parents (fixes the ambiguity bug)
INSERT INTO public.categories (id, user_id, type, name) VALUES
  ('cccccccc-0000-0000-0000-000000000001'::uuid, tests.get_supabase_uid('user1@test.com'), 'spend', 'Food'),
  ('cccccccc-0000-0000-0000-000000000002'::uuid, tests.get_supabase_uid('user1@test.com'), 'spend', 'Travel');

INSERT INTO public.categories (id, user_id, type, name, parent_id) VALUES
  ('cccccccc-0000-0000-0000-000000000003'::uuid, tests.get_supabase_uid('user1@test.com'), 'spend', 'Eating out', 'cccccccc-0000-0000-0000-000000000001'::uuid),
  ('cccccccc-0000-0000-0000-000000000004'::uuid, tests.get_supabase_uid('user1@test.com'), 'spend', 'Eating out', 'cccccccc-0000-0000-0000-000000000002'::uuid);

SELECT extensions.results_eq(
  $$
    SELECT bulk_insert_transactions('[
      {"date":"2026-02-01","type":"spend","category":"Food/Eating out","amount":20.00},
      {"date":"2026-02-02","type":"spend","category":"Travel/Eating out","amount":30.00}
    ]'::jsonb)->>'success'
  $$,
  ARRAY['true'::text],
  'Parent/Child path insert succeeds for both same-named leaves'
);

SELECT extensions.is(
  (SELECT category_id FROM public.transactions
    WHERE date = '2026-02-01' AND user_id = tests.get_supabase_uid('user1@test.com')),
  'cccccccc-0000-0000-0000-000000000003'::uuid,
  'Food/Eating out resolves to the Food-parented leaf, not Travel''s'
);

SELECT extensions.is(
  (SELECT category_id FROM public.transactions
    WHERE date = '2026-02-02' AND user_id = tests.get_supabase_uid('user1@test.com')),
  'cccccccc-0000-0000-0000-000000000004'::uuid,
  'Travel/Eating out resolves to the Travel-parented leaf, not Food''s'
);

-- Test 15: bare name that only exists as a nested child now errors
-- (previously would have ambiguously matched one of the two "Eating out" leaves)
SELECT extensions.throws_ok(
  $$ SELECT bulk_insert_transactions('[{"date":"2026-02-03","type":"spend","category":"Eating out","amount":10}]'::jsonb) $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Bare nested-only category name is rejected, not ambiguously matched'
);

-- Test 16: "Parent/Child" with nonexistent parent errors
SELECT extensions.throws_ok(
  $$ SELECT bulk_insert_transactions('[{"date":"2026-02-04","type":"spend","category":"Nonexistent/Eating out","amount":10}]'::jsonb) $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Parent/Child path with nonexistent parent errors'
);

-- Test 17: "Parent/Child" with a valid parent but nonexistent child errors
SELECT extensions.throws_ok(
  $$ SELECT bulk_insert_transactions('[{"date":"2026-02-05","type":"spend","category":"Food/Nonexistent","amount":10}]'::jsonb) $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Parent/Child path with nonexistent child errors'
);

-- Test 18: existing root-level bare-leaf-name behavior is unchanged
-- (re-verifies the row inserted by Test 1, category "Groceries")
SELECT extensions.is(
  (SELECT category_id FROM public.transactions
    WHERE date = '2025-10-15' AND user_id = tests.get_supabase_uid('user1@test.com')),
  (SELECT id FROM public.categories
    WHERE user_id = tests.get_supabase_uid('user1@test.com')
      AND name = 'Groceries' AND parent_id IS NULL),
  'Bare root-leaf category name "Groceries" still resolves correctly'
);
```

Bump the plan count at the top of the file. The existing suite has **16** assertions (verified: 2 `results_eq` + 4 `is` + 10 `throws_ok` across Tests 1–13). The new cases add **7** more (1 `results_eq` + 3 `is` + 3 `throws_ok`) = **23 total**.

```sql
-- supabase/tests/bulk_insert_test.sql, near the top
SELECT extensions.plan(23);
```

- [ ] **Step 2: Run the pgTAP suite to confirm the new cases fail against current behavior**

Run:
```bash
supabase test db
```

Expected: FAIL — Test 14's two `is` assertions fail (current code does an exact `c.name = v_tx->>'category'` match with no path parsing, so `"Food/Eating out"` matches nothing and the row errors instead of inserting); Tests 16/17 fail since there's no path-parsing at all yet. (Test 15 may incidentally pass already, but for the wrong reason — re-verify once Step 3 lands that it's throwing via the new root-only-bare-name rule, not the old any-depth lookup simply not matching "Eating out" today either.)

- [ ] **Step 3: Create the migration with the new category-resolution block**

`CREATE OR REPLACE FUNCTION public.bulk_insert_transactions` — keep required-field checks, type validation, bank_account/tags resolution, insert, and the sanitized-error `EXCEPTION` handler identical to `20260719162135_sanitize_bulk_upload_errors.sql`. Replace only the category-resolution block:

```sql
      -- Resolve category name -> id.
      -- "Parent/Child" resolves an exact nested leaf unambiguously; a bare
      -- name resolves only against root-level (parent_id IS NULL) leaves.
      v_category_id := NULL;
      IF v_tx->>'category' IS NOT NULL THEN
        DECLARE
          v_category_raw text := v_tx->>'category';
          v_slash_pos    int;
          v_parent_part  text;
          v_child_part   text;
          v_parent_id    uuid;
        BEGIN
          v_slash_pos := position('/' in v_category_raw);

          IF v_slash_pos > 0 THEN
            v_parent_part := trim(substring(v_category_raw from 1 for v_slash_pos - 1));
            v_child_part  := trim(substring(v_category_raw from v_slash_pos + 1));

            SELECT c.id INTO v_parent_id
            FROM public.categories c
            WHERE c.user_id = v_user_id
              AND c.type    = v_type
              AND c.name    = v_parent_part
              AND c.parent_id IS NULL
            LIMIT 1;

            IF v_parent_id IS NULL THEN
              v_errors := v_errors || jsonb_build_object(
                'index', v_idx,
                'error', format('Category parent "%s" not found for type "%s"', v_parent_part, v_type)
              );
              CONTINUE;
            END IF;

            SELECT c.id INTO v_category_id
            FROM public.categories c
            WHERE c.user_id = v_user_id
              AND c.type    = v_type
              AND c.name    = v_child_part
              AND c.parent_id = v_parent_id
            LIMIT 1;

            IF v_category_id IS NULL THEN
              v_errors := v_errors || jsonb_build_object(
                'index', v_idx,
                'error', format('Category "%s/%s" not found', v_parent_part, v_child_part)
              );
              CONTINUE;
            END IF;
          ELSE
            SELECT c.id INTO v_category_id
            FROM public.categories c
            LEFT JOIN public.category_hierarchy ch
              ON ch.ancestor_id = c.id AND ch.depth = 1
            WHERE c.user_id = v_user_id
              AND c.type    = v_type
              AND c.name    = v_category_raw
              AND c.parent_id IS NULL
            GROUP BY c.id
            HAVING COUNT(ch.descendant_id) = 0
            LIMIT 1;

            IF v_category_id IS NULL THEN
              v_errors := v_errors || jsonb_build_object(
                'index', v_idx,
                'error', format('Category "%s" not found as a root-level category for type "%s"', v_category_raw, v_type)
              );
              CONTINUE;
            END IF;
          END IF;
        END;
      END IF;
```

Add a header comment above `CREATE OR REPLACE FUNCTION` explaining the ambiguity bug being fixed and the two-branch rule (mirrors the "Decisions locked in" section above). Update `COMMENT ON FUNCTION public.bulk_insert_transactions IS ...` to describe the new resolution rule instead of "Only leaf categories (no children) are accepted."

- [ ] **Step 4: Re-run the pgTAP suite to confirm everything passes**

Run:
```bash
supabase test db
```

Expected: PASS, `23/23`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729130000_bulk_insert_hierarchical_category_path.sql supabase/tests/bulk_insert_test.sql
git commit -m "fix(db): resolve bulk_insert_transactions category ambiguity via Parent/Child paths"
```

---

### Task 2: Extract shared file-download helper

**Files:**
- Create: `apps/web-next/src/utility/fileDownload.ts`
- Modify: `apps/web-next/src/utility/csvExport.ts`

- [ ] **Step 1: Implement `downloadTextFile`**

```ts
// apps/web-next/src/utility/fileDownload.ts
export const downloadTextFile = (
  filename: string,
  content: string,
  mimeType: string
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 2: Refactor `downloadCsv` to use it, and export `formatCategoryPath` for reuse by JSON export**

In `csvExport.ts`: export the existing (currently private) `formatCategoryPath` helper unchanged; replace `downloadCsv`'s body with:

```ts
import { downloadTextFile } from "./fileDownload";

export const downloadCsv = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "text/csv;charset=utf-8;");
```

Nothing else in the file changes.

- [ ] **Step 3: Run existing CSV tests to confirm no regression**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/csvExport.test.ts
```

Expected: PASS.

- [ ] **Step 4: Type-check**

Run:
```bash
cd apps/web-next
npm run check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/src/utility/fileDownload.ts apps/web-next/src/utility/csvExport.ts
git commit -m "refactor(export): extract shared blob-download helper from CSV export"
```

---

### Task 3: JSON export utility with unit tests

**Files:**
- Create: `apps/web-next/src/utility/jsonExport.ts`
- Create: `apps/web-next/src/utility/jsonExport.test.ts`

- [ ] **Step 1: Write failing unit tests**

```ts
// apps/web-next/src/utility/jsonExport.test.ts
import { describe, expect, it } from "vitest";
import { transactionToJsonExportRow, buildJsonExport } from "./jsonExport";
import type { TransactionExportRow } from "./exportTransactions";

describe("transactionToJsonExportRow", () => {
  const base: TransactionExportRow = {
    date: "2026-07-01",
    type: "spend",
    category_name: null,
    category_parent_name: null,
    bank_account_name: null,
    amount: 12.34,
    tag_names: [],
    notes: null,
  };

  it("formats category as Parent/Child when a parent is present", () => {
    const row = transactionToJsonExportRow({
      ...base,
      category_name: "Eating out",
      category_parent_name: "Food",
    });
    expect(row.category).toBe("Food/Eating out");
  });

  it("uses the bare child name when there is no parent", () => {
    const row = transactionToJsonExportRow({ ...base, category_name: "Salary" });
    expect(row.category).toBe("Salary");
  });

  it("omits category entirely when uncategorized", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("category");
  });

  it("omits bank_account when unset", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("bank_account");
  });

  it("includes bank_account when present", () => {
    const row = transactionToJsonExportRow({
      ...base,
      bank_account_name: "Chase Checking",
    });
    expect(row.bank_account).toBe("Chase Checking");
  });

  it("emits tags as a real string array, not a joined string", () => {
    const row = transactionToJsonExportRow({
      ...base,
      tag_names: ["groceries", "urgent"],
    });
    expect(row.tags).toEqual(["groceries", "urgent"]);
  });

  it("omits tags when there are none", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("tags");
  });

  it("omits notes when empty", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("notes");
  });

  it("includes notes when present", () => {
    const row = transactionToJsonExportRow({ ...base, notes: "Weekly shopping" });
    expect(row.notes).toBe("Weekly shopping");
  });

  it("always includes date, type, and amount", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).toEqual({ date: "2026-07-01", type: "spend", amount: 12.34 });
  });
});

describe("buildJsonExport", () => {
  it("wraps rows in a { transactions: [...] } object matching BulkUploadPayload", () => {
    const json = buildJsonExport([
      {
        date: "2026-07-01",
        type: "spend",
        category_name: "Eating out",
        category_parent_name: "Food",
        bank_account_name: "Chase Checking",
        amount: 12.34,
        tag_names: ["groceries", "urgent"],
        notes: "Weekly shopping",
      },
    ]);
    expect(JSON.parse(json)).toEqual({
      transactions: [
        {
          date: "2026-07-01",
          type: "spend",
          amount: 12.34,
          category: "Food/Eating out",
          bank_account: "Chase Checking",
          tags: ["groceries", "urgent"],
          notes: "Weekly shopping",
        },
      ],
    });
  });

  it("pretty-prints with 2-space indentation", () => {
    const json = buildJsonExport([]);
    expect(json).toBe('{\n  "transactions": []\n}');
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/jsonExport.test.ts
```

Expected: FAIL (`jsonExport.ts` not found).

- [ ] **Step 3: Implement `jsonExport.ts`**

Reuses `formatCategoryPath` exported from `csvExport.ts` (Task 2) rather than duplicating the parent/child-join logic.

```ts
// apps/web-next/src/utility/jsonExport.ts
import type { Database } from "../types/database.types";
import type { TransactionExportRow } from "./exportTransactions";
import { formatCategoryPath } from "./csvExport";
import { downloadTextFile } from "./fileDownload";

export interface JsonExportTransaction {
  date: string;
  type: Database["public"]["Enums"]["transaction_type"];
  amount: number;
  category?: string;
  bank_account?: string;
  tags?: string[];
  notes?: string;
}

export interface JsonExportPayload {
  transactions: JsonExportTransaction[];
}

export const transactionToJsonExportRow = (
  row: TransactionExportRow
): JsonExportTransaction => {
  const result: JsonExportTransaction = {
    date: row.date,
    type: row.type,
    amount: row.amount,
  };

  const category = formatCategoryPath(row.category_name, row.category_parent_name);
  if (category) result.category = category;

  if (row.bank_account_name) result.bank_account = row.bank_account_name;
  if (row.tag_names.length > 0) result.tags = [...row.tag_names];
  if (row.notes) result.notes = row.notes;

  return result;
};

export const buildJsonExport = (rows: TransactionExportRow[]): string => {
  const payload: JsonExportPayload = {
    transactions: rows.map(transactionToJsonExportRow),
  };
  return JSON.stringify(payload, null, 2);
};

export const downloadJson = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "application/json;charset=utf-8;");
```

- [ ] **Step 4: Run tests to confirm they pass, then type-check**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/jsonExport.test.ts
npm run check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/src/utility/jsonExport.ts apps/web-next/src/utility/jsonExport.test.ts
git commit -m "feat(export): add JSON export serialization matching BulkUploadPayload shape"
```

---

### Task 4: Wire JSON export into `utility/index.ts` and the Settings UI

**Files:**
- Modify: `apps/web-next/src/utility/index.ts`
- Modify: `apps/web-next/src/pages/settings/index.tsx`

- [ ] **Step 1: Export the new utilities**

```ts
// apps/web-next/src/utility/index.ts — add alongside existing exports
export * from "./jsonExport";
export * from "./fileDownload";
```

- [ ] **Step 2: Add a format selector and branch the export path in `ExportSection`** (`apps/web-next/src/pages/settings/index.tsx`, current `ExportSection` around line 297)

Add `Segmented` to the antd import, and `buildJsonExport`/`downloadJson` to the utility import. Add local state and branch on export:

```tsx
type ExportFormat = "csv" | "json";

const ExportSection = () => {
  const { open: openNotification } = useNotification();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!range) {
      setError("Select a date range to export.");
      return;
    }
    setIsExporting(true);
    setError(null);

    const startDate = range[0].format("YYYY-MM-DD");
    const endDate = range[1].format("YYYY-MM-DD");

    const result = await fetchTransactionsForExport(startDate, endDate);

    if (!result.ok) {
      const message =
        result.reason === "too_many_rows"
          ? `This range has ${result.count.toLocaleString()} transactions, which exceeds the ${MAX_EXPORT_ROWS.toLocaleString()}-row export limit. Please choose a shorter date range.`
          : result.message;
      setError(message);
      openNotification?.({ type: "error", message: "Export failed", description: message });
      setIsExporting(false);
      return;
    }

    if (result.rows.length === 0) {
      setError("No transactions found in the selected date range.");
      setIsExporting(false);
      return;
    }

    if (format === "csv") {
      const csv = buildCsv(result.rows.map(transactionToCsvRow));
      downloadCsv(`transactions_${startDate}_to_${endDate}.csv`, csv);
    } else {
      const json = buildJsonExport(result.rows);
      downloadJson(`transactions_${startDate}_to_${endDate}.json`, json);
    }

    openNotification?.({
      type: "success",
      message: `Exported ${result.rows.length.toLocaleString()} transactions`,
    });
    setIsExporting(false);
  };

  return (
    <Card title="Export" extra={<DownloadOutlined />}>
      <Paragraph type="secondary">
        Export transactions for a date range as CSV or JSON. Limited to{" "}
        {MAX_EXPORT_ROWS.toLocaleString()} transactions per export.
      </Paragraph>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Segmented
          options={[
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
          ]}
          value={format}
          onChange={(value) => setFormat(value as ExportFormat)}
        />
        <DatePicker.RangePicker
          format={DATE_PICKER_INPUT_FORMATS}
          value={range}
          onChange={(dates) =>
            setRange(dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null)
          }
        />
        {error && <Alert message="Error" description={error} type="error" showIcon />}
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExport}
          loading={isExporting}
          disabled={!range}
        >
          {isExporting ? "Exporting..." : `Export ${format.toUpperCase()}`}
        </Button>
      </Space>
    </Card>
  );
};
```

- [ ] **Step 3: Type-check and lint**

Run:
```bash
cd apps/web-next
npm run check-types
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Manually verify in the dev server**

Run:
```bash
cd apps/web-next
npm run dev
```

Navigate to Settings > Import & Export, pick a date range covering a transaction with a parent/child category, switch the Segmented control to JSON, export, and open the downloaded file to confirm: `{ "transactions": [...] }` shape, `category` is `"Parent/Child"` (or bare for root-level/uncategorized transactions), `tags` is a real array, empty/null optional fields are omitted. Then re-upload that file via the existing Bulk Upload section to confirm it round-trips cleanly against the Task 1 fix.

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/src/utility/index.ts apps/web-next/src/pages/settings/index.tsx
git commit -m "feat(export): add JSON export format option to Settings > Import & Export"
```

---

### Task 5: E2E coverage for JSON export

**Files:**
- Modify: `apps/web-next/e2e/tests/transactions-export.spec.ts`

- [ ] **Step 1: Add a JSON-format test case inside the existing `test.describe` block**

Reuse the file's existing helpers (`fillExportDateRange`, `supabaseAdmin`, `testUser`) and seeding pattern from the existing CSV test (same file, lines 42–160) — seed a category pair, tags, and a transaction on a distinct date range so it doesn't collide with the existing CSV test's seeded row, select JSON via the `Segmented` control, export, and assert on the parsed JSON:

```ts
test("exports transactions in range as JSON with hierarchical category path and a real tags array", async ({
  page,
}) => {
  // ... seed parent category "Food", child category "Eating out", tags
  // ["urgent","groceries"], and a transaction dated e.g. 2026-04-20, following
  // the same supabaseAdmin insert pattern as the CSV test above.

  await page.goto("/settings");
  await page.getByRole("tab", { name: /import.*export/i }).click();
  await page.getByText("JSON", { exact: true }).click(); // adjust selector to the Segmented control's actual rendered role — verify while implementing
  await fillExportDateRange(page, "01/04/2026", "30/04/2026");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export json/i }).click();
  const download = await downloadPromise;

  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Download did not produce a file");
  const content = await fs.readFile(downloadPath, "utf-8");

  const parsed = JSON.parse(content);
  expect(Array.isArray(parsed.transactions)).toBe(true);
  const row = parsed.transactions.find((tx: { date: string }) => tx.date === "2026-04-20");
  expect(row).toBeDefined();
  expect(row.category).toBe("Food/Eating out");
  expect(row.tags.sort()).toEqual(["groceries", "urgent"]);
  expect(row).not.toHaveProperty("bank_account");
});
```

- [ ] **Step 2: Run the spec**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions-export.spec.ts
```

Expected: PASS (all 3 tests — original CSV happy path, row-cap error path, new JSON happy path).

- [ ] **Step 3: Commit**

```bash
git add apps/web-next/e2e/tests/transactions-export.spec.ts
git commit -m "test(export): add e2e coverage for JSON export format"
```

---

### Task 6: Update `docs/api/bulk-upload.md`

**Files:**
- Modify: `docs/api/bulk-upload.md`

- [ ] **Step 1: Update the Transaction Input Schema `category` field description** (replaces the current "Must reference an existing **leaf** category..." bullet) to document the two accepted forms — `"Parent/Child"` path (split on first `/`, trimmed, required once a category has a parent) and bare name (root-level leaves only now) — with an example.

- [ ] **Step 2: Split the per-row validation message list** — replace `Category "<name>" not found as leaf for type "<type>"` with the three new message variants: root-level-not-found, parent-not-found, and child-not-found-under-parent.

- [ ] **Step 3: Update the "Transaction Errors (per row)" table** in Error Codes & Messages to match the three new message variants.

- [ ] **Step 4: Bump `**Last Updated**: July 29, 2026`**

- [ ] **Step 5: Commit**

```bash
git add docs/api/bulk-upload.md
git commit -m "docs(bulk-upload): document Parent/Child category path resolution"
```

---

### Task 7: Open PR

- [ ] **Step 1: Full regression pass**

```bash
supabase test db
cd apps/web-next
npm run test:unit
npm run test:e2e:ci
npm run lint
npm run check-types
```

Expected: all green.

- [ ] **Step 2: Push branch and open PR**

Use the `create-pull-request` skill (per `AGENTS.md`'s git workflow rules — never commit to `main`, feature branch → PR) rather than raw `git push` + `gh pr create`. PR description should cover: the `bulk_insert_transactions` ambiguity fix and the breaking-but-correct bare-name narrowing (pointing to pgTAP Tests 14–18 as evidence), and the new JSON export format, noting its `"Parent/Child"` output is safe to round-trip through bulk upload because the backend fix ships in the same PR.

---

## Implementation order

- [ ] 1. Fix category resolution ambiguity in `bulk_insert_transactions` (Task 1)
- [ ] 2. Extract shared file-download helper (Task 2)
- [ ] 3. JSON export utility with unit tests (Task 3)
- [ ] 4. Wire JSON export into `utility/index.ts` and the Settings UI (Task 4)
- [ ] 5. E2E coverage for JSON export (Task 5)
- [ ] 6. Update `docs/api/bulk-upload.md` (Task 6)
- [ ] 7. Open PR (Task 7)

## Critical files

- `supabase/migrations/20260729130000_bulk_insert_hierarchical_category_path.sql` (new) — the resolution-rule fix
- `supabase/tests/bulk_insert_test.sql` — pgTAP coverage for the fix
- `apps/web-next/src/utility/jsonExport.ts` (new) — JSON serialization
- `apps/web-next/src/utility/csvExport.ts` — source of the shared `formatCategoryPath` helper
- `apps/web-next/src/utility/fileDownload.ts` (new) — shared blob-download helper
- `apps/web-next/src/pages/settings/index.tsx` — `ExportSection` UI
- `apps/web-next/e2e/tests/transactions-export.spec.ts` — E2E coverage
- `docs/api/bulk-upload.md` — public API docs for `bulk_upload_data`/`bulk_insert_transactions`

## Verification plan

1. `supabase test db` — pgTAP suite, 23/23 in `bulk_insert_test.sql`.
2. `cd apps/web-next && npm run test:unit` — Vitest, including new `jsonExport.test.ts`.
3. `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/transactions-export.spec.ts` — 3/3 (CSV happy path, row-cap error, new JSON happy path).
4. `npm run lint && npm run check-types` — clean.
5. Manual: export JSON from Settings > Import & Export, re-upload the same file via Bulk Upload, confirm it round-trips without ambiguity errors.

### Open implementation details to resolve while executing

- Verify the actual rendered role/selector for AntD `Segmented` in the installed version before finalizing the Task 5 e2e selector (`getByRole("radiogroup", ...)` vs. a plain `getByText` scoped to the Export card) — adjust as needed once the component is on screen.
- No dedicated unit test for `downloadTextFile` (DOM/`URL.createObjectURL`-dependent, consistent with `downloadCsv` today having none) — out of scope.

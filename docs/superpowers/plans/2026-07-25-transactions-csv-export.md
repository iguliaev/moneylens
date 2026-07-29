# Transactions CSV Export Implementation Plan

**Date:** 2026-07-25
**Status:** Implemented, PR open
**Goal:** Let a user export their own transactions for a date range they choose to a CSV file, from the Settings > Import & Export tab, with fields: date, transaction type, category (hierarchy joined with `/`), bank account, amount, tags (sorted, `;`-joined), notes.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-07-29** — Implemented Tasks 1–5. CSV escaping/row utility (`csvExport.ts`), count-capped paginated fetch (`exportTransactions.ts`), `ExportSection` wired into Settings > Import & Export, e2e coverage for the happy path (hierarchical category, bank account, sorted tags) and the row-cap error path (via `page.route` intercepting the PostgREST `HEAD` count request — required also setting `access-control-expose-headers: content-range` on the mocked response, since the real Supabase REST calls are cross-origin from the Vite dev server and the browser hides `Content-Range` from JS otherwise). Manually verified export in the dev server. Opening PR next.
- **2026-07-25** — Plan created (PR #241). Not started.

**Architecture:** No new database objects are needed — the existing `transactions_with_details` view (added in `supabase/migrations/20260627120000_transaction_category_parent_labels.sql`) already resolves category parent/child names and pre-sorts/aggregates tag names (`ARRAY_AGG(... ORDER BY tg.name)`), scoped by RLS to the current user. The frontend adds:
1. A pure CSV-serialization utility (escaping, row building, browser download).
2. A data-fetching utility that counts rows in the requested date range, rejects the export if it exceeds a hard cap, and otherwise paginates the view (PostgREST's `max_rows = 1000`, `supabase/config.toml:18`, requires `.range()` paging past 1000).
3. A UI section in Settings mirroring the existing `BulkUploadSection` pattern.

**Decisions locked in with the user:**
- Placement: Settings > Import & Export tab (new "Export" card next to Bulk Upload), not the Transactions list page.
- Row cap: **10,000 transactions per export.** Enforced via a cheap `count`-only query before fetching; if exceeded, block export and ask the user to narrow the date range (no silent truncation of financial data).
- CSV delimiter: fixed `,`. Tags are `;`-joined (no delimiter-config UI for v1).
- Dates exported as raw ISO `YYYY-MM-DD` (not the UI's `DD/MM/YYYY` display format) for unambiguous reimport.

**Tech Stack:** TypeScript, Supabase JS client (direct queries, not Refine's `dataProvider`, since this needs count-then-paginate control), Vitest for unit tests, Playwright for E2E, Ant Design (`DatePicker.RangePicker`, `Button`, `Card`, `Alert`) matching `pages/settings/index.tsx` conventions.

---

### Task 1: CSV serialization utility with unit tests

**Files:**
- Create: `apps/web-next/src/utility/csvExport.ts`
- Create: `apps/web-next/src/utility/csvExport.test.ts`

- [ ] **Step 1: Write failing unit tests for CSV field escaping and row building**

```ts
// apps/web-next/src/utility/csvExport.test.ts
import { describe, expect, it } from "vitest";
import { escapeCsvField, buildCsv, transactionToCsvRow } from "./csvExport";
import type { TransactionExportRow } from "./exportTransactions";

describe("escapeCsvField", () => {
  it("returns plain values unchanged", () => {
    expect(escapeCsvField("Groceries")).toBe("Groceries");
    expect(escapeCsvField(42.5)).toBe("42.5");
  });

  it("quotes and escapes commas, quotes, and newlines", () => {
    expect(escapeCsvField("Food/Eating out")).toBe("Food/Eating out");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles null/undefined as empty field", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });
});

describe("transactionToCsvRow", () => {
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

  it("joins parent/child category with a slash", () => {
    const row = transactionToCsvRow({
      ...base,
      category_name: "Eating out",
      category_parent_name: "Food",
    });
    expect(row[2]).toBe("Food/Eating out");
  });

  it("uses child name only when there is no parent", () => {
    const row = transactionToCsvRow({ ...base, category_name: "Salary" });
    expect(row[2]).toBe("Salary");
  });

  it("emits an empty category field when uncategorized", () => {
    const row = transactionToCsvRow(base);
    expect(row[2]).toBe("");
  });

  it("includes the bank account name", () => {
    const row = transactionToCsvRow({
      ...base,
      bank_account_name: "Chase Checking",
    });
    expect(row[3]).toBe("Chase Checking");
  });

  it("emits an empty bank account field when unset", () => {
    const row = transactionToCsvRow(base);
    expect(row[3]).toBe("");
  });

  it("joins tags with a semicolon, preserving DB sort order", () => {
    const row = transactionToCsvRow({
      ...base,
      tag_names: ["groceries", "urgent"],
    });
    expect(row[5]).toBe("groceries;urgent");
  });
});

describe("buildCsv", () => {
  it("emits a header row and CRLF-joined data rows", () => {
    const csv = buildCsv([
      [
        "2026-07-01",
        "spend",
        "Food/Eating out",
        "Chase Checking",
        "12.34",
        "groceries;urgent",
        "",
      ],
    ]);
    expect(csv).toBe(
      "Date,Type,Category,Bank Account,Amount,Tags,Notes\r\n" +
        "2026-07-01,spend,Food/Eating out,Chase Checking,12.34,groceries;urgent,\r\n"
    );
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail (module doesn't exist yet)**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/csvExport.test.ts
```

Expected: FAIL (`csvExport.ts` / `exportTransactions.ts` not found).

- [ ] **Step 3: Implement `csvExport.ts`**

```ts
// apps/web-next/src/utility/csvExport.ts
import type { TransactionExportRow } from "./exportTransactions";

const CSV_HEADER = [
  "Date",
  "Type",
  "Category",
  "Bank Account",
  "Amount",
  "Tags",
  "Notes",
];

export const escapeCsvField = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const formatCategoryPath = (
  name: string | null,
  parentName: string | null
): string => {
  if (!name) return "";
  return parentName ? `${parentName}/${name}` : name;
};

export const transactionToCsvRow = (row: TransactionExportRow): string[] => [
  row.date,
  row.type,
  formatCategoryPath(row.category_name, row.category_parent_name),
  row.bank_account_name ?? "",
  String(row.amount),
  [...row.tag_names].join(";"),
  row.notes ?? "",
];

export const buildCsv = (rows: string[][]): string => {
  const lines = [CSV_HEADER, ...rows].map((row) =>
    row.map(escapeCsvField).join(",")
  );
  return lines.join("\r\n") + "\r\n";
};

export const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
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

Note: `tag_names` is already sorted by the DB view (`ARRAY_AGG(... ORDER BY tg.name)`), so `transactionToCsvRow` does not re-sort — just joins in the order received.

- [ ] **Step 4: Run tests again to confirm the escaping/row tests pass (fetch tests still pending Task 2)**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/csvExport.test.ts
```

Expected: PASS once `exportTransactions.ts` exists with the `TransactionExportRow` type (add a minimal type stub in Task 2 Step 1 before this can fully pass — see ordering note below).

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/src/utility/csvExport.ts apps/web-next/src/utility/csvExport.test.ts
git commit -m "feat(export): add CSV escaping and row-building utility"
```

### Task 2: Count + paginated fetch utility with unit tests

**Files:**
- Create: `apps/web-next/src/utility/exportTransactions.ts`
- Create: `apps/web-next/src/utility/exportTransactions.test.ts`

- [ ] **Step 1: Define the shared row type and export result type**

```ts
// apps/web-next/src/utility/exportTransactions.ts (types + constants first)
import { supabaseClient } from "./supabaseClient";
import type { Database } from "../types/database.types";

export const MAX_EXPORT_ROWS = 10_000;
const PAGE_SIZE = 1000; // matches PostgREST max_rows (supabase/config.toml)

export interface TransactionExportRow {
  date: string;
  type: Database["public"]["Enums"]["transaction_type"];
  category_name: string | null;
  category_parent_name: string | null;
  bank_account_name: string | null;
  amount: number;
  tag_names: string[];
  notes: string | null;
}

export type ExportFetchResult =
  | { ok: true; rows: TransactionExportRow[] }
  | { ok: false; reason: "too_many_rows"; count: number }
  | { ok: false; reason: "error"; message: string };
```

- [ ] **Step 2: Write failing unit tests for count-cap and pagination behavior**

```ts
// apps/web-next/src/utility/exportTransactions.test.ts
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTransactionsForExport,
  MAX_EXPORT_ROWS,
} from "./exportTransactions";

function createSupabaseMock({
  count,
  pages,
}: {
  count: number;
  pages: unknown[][];
}) {
  let rangeCall = -1;
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => {
    rangeCall += 1;
    const data = pages[rangeCall] ?? [];
    return Promise.resolve({ data, error: null, count });
  });
  // head:true count-only call resolves directly on `.lte()`'s promise-like chain
  (chain as { then: PromiseLike<unknown>["then"] }).then = (resolve) =>
    Promise.resolve({ data: null, error: null, count }).then(resolve);

  const from = vi.fn(() => chain);
  return { from } as unknown as SupabaseClient;
}

describe("fetchTransactionsForExport", () => {
  it("rejects when the count exceeds MAX_EXPORT_ROWS", async () => {
    const client = createSupabaseMock({ count: MAX_EXPORT_ROWS + 1, pages: [] });
    const result = await fetchTransactionsForExport(
      client,
      "2026-01-01",
      "2026-12-31"
    );
    expect(result).toEqual({
      ok: false,
      reason: "too_many_rows",
      count: MAX_EXPORT_ROWS + 1,
    });
  });

  it("paginates across multiple pages up to the returned count", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 500 }, (_, i) => ({ id: 1000 + i }));
    const client = createSupabaseMock({ count: 1500, pages: [page1, page2] });
    const result = await fetchTransactionsForExport(
      client,
      "2026-01-01",
      "2026-12-31"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(1500);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail (function not implemented)**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/exportTransactions.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `countTransactionsInRange` and `fetchTransactionsForExport`**

Accept an injected `SupabaseClient` (default to the app's singleton) so tests can mock it, matching the pattern already used in `softDeleteDataProvider.ts`.

```ts
// apps/web-next/src/utility/exportTransactions.ts (continued)
import type { SupabaseClient } from "@supabase/supabase-js";

export const countTransactionsInRange = async (
  client: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<number> => {
  const { count, error } = await client
    .from("transactions_with_details")
    .select("id", { count: "exact", head: true })
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export const fetchTransactionsForExport = async (
  client: SupabaseClient = supabaseClient,
  startDate: string,
  endDate: string
): Promise<ExportFetchResult> => {
  try {
    const count = await countTransactionsInRange(client, startDate, endDate);
    if (count > MAX_EXPORT_ROWS) {
      return { ok: false, reason: "too_many_rows", count };
    }
    if (count === 0) return { ok: true, rows: [] };

    const rows: TransactionExportRow[] = [];
    for (let from = 0; from < count; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE, count) - 1;
      const { data, error } = await client
        .from("transactions_with_details")
        .select(
          "date, type, category_name, category_parent_name, bank_account_name, amount, tag_names, notes"
        )
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .range(from, to);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as TransactionExportRow[]));
    }
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Export failed",
    };
  }
};
```

Note: put the injected-client parameter first (`client` before `startDate`/`endDate`) or use an options object — pick whichever matches the mock signature above consistently; adjust the test call sites if the final signature differs.

- [ ] **Step 5: Run both utility test files together**

Run:
```bash
cd apps/web-next
npx vitest run src/utility/csvExport.test.ts src/utility/exportTransactions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Type-check**

Run:
```bash
cd apps/web-next
npm run check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web-next/src/utility/exportTransactions.ts apps/web-next/src/utility/exportTransactions.test.ts
git commit -m "feat(export): add count-capped paginated transaction fetch for export"
```

### Task 3: Wire `utility/index.ts` exports and build the Settings UI

**Files:**
- Modify: `apps/web-next/src/utility/index.ts`
- Modify: `apps/web-next/src/pages/settings/index.tsx`

- [ ] **Step 1: Export the new utilities**

```ts
// apps/web-next/src/utility/index.ts — add alongside existing exports
export * from "./csvExport";
export * from "./exportTransactions";
```

- [ ] **Step 2: Add `ExportSection` component to Settings, next to `BulkUploadSection`**

```tsx
// apps/web-next/src/pages/settings/index.tsx — new imports
import { DatePicker } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  buildCsv,
  downloadCsv,
  transactionToCsvRow,
  fetchTransactionsForExport,
  MAX_EXPORT_ROWS,
} from "../../utility";
import { DATE_PICKER_INPUT_FORMATS } from "../../utility"; // if not already imported here
```

```tsx
const ExportSection = () => {
  const { open: openNotification } = useNotification();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
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

    const result = await fetchTransactionsForExport(undefined, startDate, endDate);

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

    const csv = buildCsv(result.rows.map(transactionToCsvRow));
    downloadCsv(`transactions_${startDate}_to_${endDate}.csv`, csv);
    openNotification?.({
      type: "success",
      message: `Exported ${result.rows.length.toLocaleString()} transactions`,
    });
    setIsExporting(false);
  };

  return (
    <Card title="Export" extra={<DownloadOutlined />}>
      <Paragraph type="secondary">
        Export transactions for a date range as CSV. Limited to{" "}
        {MAX_EXPORT_ROWS.toLocaleString()} transactions per export.
      </Paragraph>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
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
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </Space>
    </Card>
  );
};
```

- [ ] **Step 3: Add `ExportSection` to the `import-export` tab, above or below `BulkUploadSection`**

```tsx
{
  key: "import-export",
  label: "Import & Export",
  children: (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <ExportSection />
      <BulkUploadSection />
    </Space>
  ),
},
```

- [ ] **Step 4: Type-check and lint**

Run:
```bash
cd apps/web-next
npm run check-types
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Manually verify in the dev server**

Run:
```bash
cd apps/web-next
npm run dev
```

Navigate to Settings > Import & Export, pick a date range covering seeded/test transactions with hierarchical categories, a bank account, and tags, click Export CSV, and open the downloaded file to confirm: category shows `Parent/Child`, bank account name is present, tags are semicolon-joined and alphabetically sorted, dates are ISO `YYYY-MM-DD`.

- [ ] **Step 6: Commit**

```bash
git add apps/web-next/src/utility/index.ts apps/web-next/src/pages/settings/index.tsx
git commit -m "feat(export): add CSV export UI to Settings > Import & Export"
```

### Task 4: E2E coverage

**Files:**
- Create: `apps/web-next/e2e/tests/transactions-export.spec.ts`

- [ ] **Step 1: Write E2E test for the happy path**

Set up a transaction with a parent/child category, a bank account, and multiple tags (via existing create flow or seed helpers used elsewhere in `e2e/tests/`), then:

```ts
import { test, expect } from "@playwright/test";

test("exports transactions in range as CSV with hierarchical category, bank account, and sorted tags", async ({
  page,
}) => {
  // ... reuse existing e2e helpers to create a transaction dated within a known
  // range, with category "Food" > "Eating out", bank account "Chase Checking",
  // and tags ["urgent", "groceries"].

  await page.goto("/settings");
  await page.getByRole("tab", { name: "Import & Export" }).click();

  const downloadPromise = page.waitForEvent("download");
  // ... set the RangePicker to cover the seeded transaction's date
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  const path = await download.path();
  const content = await require("fs/promises").readFile(path!, "utf-8");
  expect(content).toContain("Food/Eating out");
  expect(content).toContain("Chase Checking");
  expect(content).toContain("groceries;urgent"); // sorted alphabetically
});
```

- [ ] **Step 2: Write E2E test for the row-limit error path**

Cover the "too many rows" branch either by stubbing `fetchTransactionsForExport`'s network calls (Playwright route interception on the PostgREST count request) or, if seeding 10,001 rows is impractical for E2E, drop this to a unit-test-only concern and note it explicitly as out of scope for E2E (already covered in Task 2's unit tests).

- [ ] **Step 3: Run the new spec**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions-export.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/e2e/tests/transactions-export.spec.ts
git commit -m "test(export): add e2e coverage for CSV export"
```

### Task 5: Open PR

- [ ] **Step 1: Push branch and open PR**

Use the `create-pull-request` skill (per this repo's `AGENTS.md` git workflow rules) rather than raw `git push` + `gh pr create`.

Expected: PR includes all commits from Tasks 1–4, summarizing the CSV export feature, the 10,000-row cap rationale, and the category/tag formatting rules.

---

### Open implementation details to resolve while executing (not blocking plan approval)

- Exact parameter order/signature for `fetchTransactionsForExport` (client-first vs. options-object) — pick whichever keeps call sites in Task 3 and the mocks in Task 2 consistent; the snippets above have a minor inconsistency (default parameter placed before required parameters) that must be fixed to valid TypeScript before implementing (e.g. `(startDate, endDate, client = supabaseClient)` or an options object).
- Confirm `DATE_PICKER_INPUT_FORMATS` is already imported once in `settings/index.tsx` (currently used in `transactions/list.tsx`) rather than double-imported.
- Confirm whether existing e2e tests already have a seeding helper for hierarchical categories + tags to reuse in Task 4, or whether one needs to be added.

---

### Future work: JSON export and the leaf-only import category constraint

Not part of this plan. Captured here so it isn't lost before JSON export is scoped.

We discussed adding a JSON export later, in a format similar to the existing bulk-upload import shape (`BulkUploadPayload`/`bulk_insert_transactions` in `supabase/migrations/20260719162135_sanitize_bulk_upload_errors.sql`). Key findings:

- **The data-fetching layer is already format-agnostic and reusable.** `fetchTransactionsForExport`/`TransactionExportRow` (Task 2) return neutral row data before any CSV-specific formatting — a future JSON export would call the same function and just serialize differently (`jsonExport.ts` next to `csvExport.ts`), no shared "row formatter" needed.
- **Category representation is the one real design decision to make once, deliberately, rather than copying today's import behavior.** `bulk_insert_transactions` currently resolves a transaction's `category` field by **exact leaf name only** (`c.name = v_tx->>'category'`, restricted to leaf categories, migration `20260601220000_bulk_insert_leaf_categories.sql`). That leaf-only restriction was a deliberate choice at the time, but is now considered dated/limiting.
- Since `20260627124710_fix_category_unique_constraint_include_parent_id.sql` allows the **same leaf name under different parents** (e.g. `Food > Other` and `Transport > Other`), the current bare-name lookup with `LIMIT 1` has a latent ambiguity bug — it can silently resolve to the wrong category when names collide across parents.
- **Recommendation:** when JSON export is scoped, don't make it downgrade to leaf-name-only to match import. Instead:
  1. JSON export emits `category` as the same hierarchical `"Parent/Child"` path CSV uses — one shared convention across both export formats.
  2. Update `bulk_insert_transactions` (new migration + pgTAP test) to parse `"Parent/Child"` and resolve unambiguously, fixing the latent collision bug as a side effect. Decide then whether to keep accepting a bare leaf name as a fallback for backward compatibility with already-exported/hand-written JSON files, or drop it.
  3. This is backend work independent of CSV export and should be scoped as its own task when JSON export work begins (or sooner, as a standalone bug-fix migration for the ambiguity issue, regardless of JSON export timing).
- Also note: the JSON import shape includes `bank_account`, which CSV export (this plan) now also includes — so once the category-path question above is resolved, JSON export's per-transaction shape converges closely with CSV's columns, just as a nested object with a native `tags: string[]` instead of a `;`-joined string.

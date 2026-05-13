# Frontend Architecture Remaining Items (M3, M4, L3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining frontend architecture work by standardizing error handling, extracting a shared month-range picker, and documenting/typing intentional direct Supabase RPC usage.

**Architecture:** Keep existing Refine resource/data-provider flows intact and make only focused UI-layer changes. Centralize direct RPC calls in one typed utility module and route user-visible failures through Refine notifications for consistency. Reuse one shared controlled picker component for all dashboard month-range selection UX and validation.

**Tech Stack:** React 19, TypeScript, Refine (`@refinedev/core`, `@refinedev/antd`), Ant Design 5, Supabase JS client, Playwright E2E

---

## Scope Check

This plan covers a single subsystem (`apps/web-next` frontend architecture hygiene) and only the pending items from the spec:
- M3: Standardize error handling across data-fetching hooks/forms
- M4: Extract shared month-range picker and add range validation
- L3: Audit/document intentional direct Supabase RPC usage and centralize wrappers

Already-completed spec items (H1, H2, H3, M1, M2, L1, L2) are out of scope.

## File Structure

### New Files
- `apps/web-next/src/utility/rpc.ts`  
  Single typed module for frontend-kept RPC calls and argument/result types.
- `apps/web-next/src/components/MonthRangePicker.tsx`  
  Shared controlled picker used by dashboard period/charts selectors.
- `apps/web-next/e2e/tests/dashboard-month-range.spec.ts`  
  Covers invalid range validation + blocked data rendering.
- `apps/web-next/e2e/tests/settings-rpc-resilience.spec.ts`  
  Covers bulk upload/reset failures surfacing clear user-visible notifications.

### Modified Files
- `apps/web-next/src/utility/index.ts`  
  Re-export RPC wrappers and add architecture convention comment.
- `apps/web-next/src/pages/settings/index.tsx`  
  Replace inline `supabaseClient.rpc` usage with typed wrappers + intentional markers.
- `apps/web-next/src/hooks/useTransactionForm.ts`  
  Switch direct RPC calls to wrapper functions + intentional markers retained in wrapper.
- `apps/web-next/src/pages/budgets/create.tsx`  
  Replace `message.error` with Refine notification; remove silent return on missing budget ID.
- `apps/web-next/src/pages/budgets/edit.tsx`  
  Replace `message.error` with Refine notification; remove silent return on missing edit ID.
- `apps/web-next/src/pages/dashboard/components/PeriodTab.tsx`  
  Replace inline year/month selector with `MonthRangePicker` (`singleMonth` mode).
- `apps/web-next/src/pages/dashboard/ChartsTab.tsx`  
  Replace inline start/end selectors with `MonthRangePicker` and invalid-range guard UI.
- `apps/web-next/src/pages/dashboard/index.tsx`  
  (only if needed) pass selector props cleanly into tab children.

---

### Task 1: Add typed RPC wrapper layer and mark intentional direct Supabase usage (L3)

**Files:**
- Create: `apps/web-next/src/utility/rpc.ts`
- Modify: `apps/web-next/src/utility/index.ts`
- Modify: `apps/web-next/src/pages/settings/index.tsx`
- Modify: `apps/web-next/src/hooks/useTransactionForm.ts`
- Test: `apps/web-next/e2e/tests/settings-rpc-resilience.spec.ts`

- [ ] **Step 1: Write the failing test for settings RPC failures**

```ts
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

test.describe("Settings RPC resilience", () => {
  test("bulk upload failure surfaces a visible error", async ({ page }) => {
    const { email, password, userId } = await createTestUser("settings-rpc");
    try {
      await loginUser(page, email, password);
      await page.goto("/settings");
      await page.getByRole("tab", { name: /import.*export/i }).click();
      await expect(page.getByText("Bulk Upload")).toBeVisible();
      // This assertion will fail until error handling is normalized in task 2.
      await expect(page.getByText(/failed to upload data/i)).toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/settings-rpc-resilience.spec.ts`  
Expected: FAIL because standardized notification/error copy is not implemented yet.

- [ ] **Step 3: Write minimal RPC wrapper implementation**

```ts
// apps/web-next/src/utility/rpc.ts
import { supabaseClient } from "./supabaseClient";

export interface BulkUploadPayload {
  categories?: Array<{ type: string; name: string; description?: string | null }>;
  bank_accounts?: Array<{ name: string; description?: string | null }>;
  tags?: Array<{ name: string; description?: string | null }>;
  transactions?: Array<{
    date: string;
    type: string;
    amount: number;
    category?: string | null;
    bank_account?: string | null;
    tags?: string[] | null;
    notes?: string | null;
  }>;
}

// INTENTIONAL_DIRECT_SUPABASE: RPC is backend-owned and not a Refine resource CRUD operation.
export const bulkUploadData = (payload: BulkUploadPayload) =>
  supabaseClient.rpc("bulk_upload_data", { p_payload: payload });

// INTENTIONAL_DIRECT_SUPABASE: RPC executes destructive account-scoped reset logic in DB.
export const resetUserData = () => supabaseClient.rpc("reset_user_data");

// INTENTIONAL_DIRECT_SUPABASE: atomic transaction + tag write path is implemented as DB RPC.
export const createTransactionWithTags = (
  transaction: Record<string, unknown>,
  tagIds: string[]
) => supabaseClient.rpc("create_transaction_with_tags", { p_transaction: transaction, p_tag_ids: tagIds });

// INTENTIONAL_DIRECT_SUPABASE: atomic transaction + tag update path is implemented as DB RPC.
export const updateTransactionWithTags = (
  transactionId: string,
  transaction: Record<string, unknown>,
  tagIds: string[]
) =>
  supabaseClient.rpc("update_transaction_with_tags", {
    p_transaction_id: transactionId,
    p_transaction: transaction,
    p_tag_ids: tagIds,
  });
```

- [ ] **Step 4: Wire callers to wrappers and add utility convention comment**

```ts
// apps/web-next/src/utility/index.ts
// Direct Supabase calls outside Refine data hooks must either:
// 1) surface errors via useNotification in component scope, or
// 2) return typed errors to callers for explicit handling.
// Never silently swallow Supabase errors.
export * from "./supabaseClient";
export * from "./currency";
export * from "./rpc";
```

```ts
// settings/index.tsx (imports)
import { bulkUploadData, resetUserData } from "../../utility";

// replace supabaseClient.rpc("bulk_upload_data", { p_payload: payload })
const { data, error } = await bulkUploadData(payload);

// replace supabaseClient.rpc("reset_user_data")
const { data, error: rpcError } = await resetUserData();
```

```ts
// useTransactionForm.ts (imports)
import { createTransactionWithTags, updateTransactionWithTags } from "../utility";

// replace direct rpc calls
const result = await createTransactionWithTags(transactionFields, tagIds);
const result = await updateTransactionWithTags(id, transactionFields, tagIds);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/settings-rpc-resilience.spec.ts`  
Expected: PASS once error copy/notification behavior in Task 2 is completed.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web-next/src/utility/rpc.ts \
  apps/web-next/src/utility/index.ts \
  apps/web-next/src/pages/settings/index.tsx \
  apps/web-next/src/hooks/useTransactionForm.ts \
  apps/web-next/e2e/tests/settings-rpc-resilience.spec.ts
git commit -m "refactor: centralize intentional frontend RPC calls"
```

---

### Task 2: Standardize user-visible error handling with Refine notifications (M3)

**Files:**
- Modify: `apps/web-next/src/pages/budgets/create.tsx`
- Modify: `apps/web-next/src/pages/budgets/edit.tsx`
- Modify: `apps/web-next/src/pages/settings/index.tsx`
- Modify: `apps/web-next/src/hooks/usePeriodStats.ts`
- Modify: `apps/web-next/src/hooks/useChartsData.ts`
- Modify: `apps/web-next/src/pages/dashboard/useBudgets.ts`
- Test: `apps/web-next/e2e/tests/settings-rpc-resilience.spec.ts`

- [ ] **Step 1: Extend failing test to assert standardized notification UX**

```ts
test("reset data RPC failure shows notification", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: /danger zone/i }).click();
  await page.getByRole("button", { name: /reset all data/i }).click();
  await page.getByRole("button", { name: /yes, delete everything/i }).click();

  // Standardized notification text target
  await expect(page.getByText(/failed to reset data/i)).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/settings-rpc-resilience.spec.ts -g "reset data RPC failure"`  
Expected: FAIL before notification standardization is in place.

- [ ] **Step 3: Implement minimal notification standardization**

```ts
// budgets/create.tsx
import { useNotification } from "@refinedev/core";
// remove: message import
const { open } = useNotification();

if (!budgetId) {
  open?.({
    type: "error",
    message: "Failed to create budget",
    description: "Budget ID was not returned from create mutation.",
  });
  throw new Error("Missing budget ID after create");
}

if (errors.length > 0) {
  open?.({
    type: "error",
    message: "Budget created with link errors",
    description: errors.join(", "),
  });
}
```

```ts
// budgets/edit.tsx
import { useNotification } from "@refinedev/core";
const { open } = useNotification();

if (!id) {
  open?.({
    type: "error",
    message: "Failed to update budget",
    description: "Budget ID is missing in edit route.",
  });
  throw new Error("Missing budget ID in edit form");
}

if (errors.length > 0) {
  open?.({
    type: "error",
    message: "Budget saved with relation update errors",
    description: errors.join(", "),
  });
}
```

```ts
// settings/index.tsx (replace message.success + inline-only error handling)
import { useNotification } from "@refinedev/core";
const { open } = useNotification();

open?.({ type: "success", message: "Upload completed successfully" });
open?.({
  type: "error",
  message: "Failed to upload data",
  description: err instanceof Error ? err.message : "Upload failed",
});
```

```ts
// usePeriodStats.ts
const loading =
  typeQuery.isLoading || categoryQuery.isLoading || prevTypeQuery.isLoading;

return {
  typeSummary,
  categorySummary,
  previousTypeSummary,
  loading,
  error: typeQuery.error ?? categoryQuery.error ?? prevTypeQuery.error ?? null,
};
```

- [ ] **Step 4: Render hook error states in dashboard components**

```ts
// PeriodTab.tsx and/or ChartsTab.tsx
import { Alert } from "antd";

if (stats.error) {
  return (
    <Alert
      type="error"
      showIcon
      message="Failed to load statistics"
      description={stats.error.message}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/settings-rpc-resilience.spec.ts`  
Expected: PASS with visible standardized failure notifications.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web-next/src/pages/budgets/create.tsx \
  apps/web-next/src/pages/budgets/edit.tsx \
  apps/web-next/src/pages/settings/index.tsx \
  apps/web-next/src/hooks/usePeriodStats.ts \
  apps/web-next/src/hooks/useChartsData.ts \
  apps/web-next/src/pages/dashboard/useBudgets.ts \
  apps/web-next/e2e/tests/settings-rpc-resilience.spec.ts
git commit -m "refactor: standardize frontend error handling via refine notifications"
```

---

### Task 3: Extract shared MonthRangePicker and enforce valid month range (M4)

**Files:**
- Create: `apps/web-next/src/components/MonthRangePicker.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/PeriodTab.tsx`
- Modify: `apps/web-next/src/pages/dashboard/ChartsTab.tsx`
- Test: `apps/web-next/e2e/tests/dashboard-month-range.spec.ts`

- [ ] **Step 1: Write failing dashboard range validation test**

```ts
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

test("charts tab blocks invalid month range", async ({ page }) => {
  const { email, password, userId } = await createTestUser("month-range");
  try {
    await loginUser(page, email, password);
    await page.getByRole("tab", { name: /charts/i }).click();
    // Will fail until MonthRangePicker + validation is implemented.
    await expect(page.getByText(/end month must be after start month/i)).toBeVisible();
  } finally {
    await deleteTestUser(userId);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/dashboard-month-range.spec.ts`  
Expected: FAIL because no invalid-range warning exists yet.

- [ ] **Step 3: Implement MonthRangePicker component**

```tsx
// apps/web-next/src/components/MonthRangePicker.tsx
import { Select, Space, Typography } from "antd";
import { yearOptions, monthOptions } from "../constants/dateOptions";

export interface MonthRangePickerProps {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  onChange: (range: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }) => void;
  singleMonth?: boolean;
}

export const MonthRangePicker = ({
  startYear,
  startMonth,
  endYear,
  endMonth,
  onChange,
  singleMonth = false,
}: MonthRangePickerProps) => {
  const { Text } = Typography;
  return (
    <Space wrap align="center">
      <Text strong>{singleMonth ? "Year:" : "From:"}</Text>
      <Select value={startYear} options={yearOptions} onChange={(v) => onChange({ startYear: v, startMonth, endYear, endMonth })} style={{ width: 100 }} />
      <Select value={startMonth} options={monthOptions} onChange={(v) => onChange({ startYear, startMonth: v, endYear, endMonth })} style={{ width: 130 }} />
      {!singleMonth && (
        <>
          <Text strong>To:</Text>
          <Select value={endYear} options={yearOptions} onChange={(v) => onChange({ startYear, startMonth, endYear: v, endMonth })} style={{ width: 100 }} />
          <Select value={endMonth} options={monthOptions} onChange={(v) => onChange({ startYear, startMonth, endYear, endMonth: v })} style={{ width: 130 }} />
        </>
      )}
    </Space>
  );
};
```

- [ ] **Step 4: Wire both dashboard views and add invalid-range guard**

```tsx
// ChartsTab.tsx
const isInvalidRange =
  dayjs().year(endYear).month(endMonth).startOf("month").isSameOrBefore(
    dayjs().year(startYear).month(startMonth).startOf("month")
  );

{isInvalidRange ? (
  <Alert
    type="warning"
    showIcon
    message="Invalid date range"
    description="End month must be after start month."
  />
) : (
  <TrendChart data={trend} currency={currency} />
)}
```

```tsx
// PeriodTab.tsx
<MonthRangePicker
  singleMonth
  startYear={selectedYear}
  startMonth={selectedMonth}
  endYear={selectedYear}
  endMonth={selectedMonth}
  onChange={({ startYear, startMonth }) => {
    setSelectedYear(startYear);
    setSelectedMonth?.(startMonth);
  }}
/>;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/dashboard-month-range.spec.ts`  
Expected: PASS with warning shown and charts hidden for invalid ranges.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web-next/src/components/MonthRangePicker.tsx \
  apps/web-next/src/pages/dashboard/components/PeriodTab.tsx \
  apps/web-next/src/pages/dashboard/ChartsTab.tsx \
  apps/web-next/e2e/tests/dashboard-month-range.spec.ts
git commit -m "feat: add shared month range picker with validation"
```

---

### Task 4: Regression pass for remaining architecture items

**Files:**
- Test: `apps/web-next/e2e/tests/dashboard.spec.ts`
- Test: `apps/web-next/e2e/tests/settings-tabs.spec.ts`
- Test: `apps/web-next/e2e/tests/budgets.spec.ts`
- Test: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Add/adjust assertions for refactored selectors and notifications**

```ts
// dashboard.spec.ts additions
await expect(page.getByText(/from:/i)).toBeVisible();
await expect(page.getByText(/to:/i)).toBeVisible();
```

```ts
// settings-tabs.spec.ts additions
await expect(page.getByText(/failed to upload data/i)).not.toBeVisible();
```

- [ ] **Step 2: Run focused suite**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/dashboard.spec.ts e2e/tests/settings-tabs.spec.ts e2e/tests/budgets.spec.ts e2e/tests/transactions.spec.ts`  
Expected: PASS.

- [ ] **Step 3: Run quality checks**

Run: `cd apps/web-next && npm run lint && npm run check-types`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/e2e/tests/dashboard.spec.ts apps/web-next/e2e/tests/settings-tabs.spec.ts
git commit -m "test: cover remaining frontend architecture refactors"
```

---

## Dependency Order

1. Task 1 (RPC wrappers) → prerequisite for consistent call sites in Task 2  
2. Task 2 (error handling normalization)  
3. Task 3 (shared picker + validation)  
4. Task 4 (regression and final checks)

## Notes

- Keep changes DRY: do not duplicate RPC names or date-selector rendering logic.
- Keep YAGNI: only wrap RPCs currently used in frontend (`bulk_upload_data`, `reset_user_data`, `create_transaction_with_tags`, `update_transaction_with_tags`).
- Avoid broad catch/silent failure paths; always surface an actionable message.
- Prefer small commits by task so any regression is easy to isolate.

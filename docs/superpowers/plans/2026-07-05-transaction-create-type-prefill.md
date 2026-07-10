# Transaction Create Type Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill the transaction Type on `/transactions/create` only when navigation comes from the transactions list tab context, while keeping Type unselected for all other entry paths.

**Architecture:** Carry explicit context from `TransactionList` to create via query params (`source`, `type`), then validate and apply that context in `TransactionCreate` initial form values. Keep existing form validation and category filtering behavior unchanged so invalid/missing context falls back to required manual type selection.

**Tech Stack:** TypeScript, React Router, Refine (`List`, `useForm`), Ant Design `Form`/`Select`, Playwright E2E.

---

### Task 1: Add failing E2E coverage for type prefill behavior

**Files:**
- Modify: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Write failing test for preselecting type when opened from transactions list tab**

```ts
test("create page preselects type from transactions list tab context", async ({
  page,
}) => {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

  await page
    .getByRole("radiogroup", { name: "segmented control" })
    .getByText(/^Earn$/i)
    .click();

  await page.getByRole("button", { name: /create/i }).click();
  await expect(page).toHaveURL(
    /\/transactions\/create\?source=transactions-list&type=earn/
  );

  await expect(
    page.locator(".ant-select-selection-item").filter({ hasText: /^Earn$/i })
  ).toBeVisible();
});
```

- [ ] **Step 2: Write failing test for direct create page (no preselected type)**

```ts
test("direct create page keeps type unselected", async ({ page }) => {
  await page.goto("/transactions/create");
  await expect(page.getByRole("heading", { name: "Create Transaction" })).toBeVisible();

  await expect(page.getByRole("combobox", { name: "* Type" })).toHaveText("");
});
```

- [ ] **Step 3: Run only the new tests to confirm at least the first one fails**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "preselects type|keeps type unselected"
```

Expected: FAIL on preselect test before implementation because create button does not pass context yet.

- [ ] **Step 4: Commit failing tests**

```bash
git add apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "test(transactions): add coverage for create type prefill context"
```

### Task 2: Implement explicit navigation context and validated create prefill

**Files:**
- Modify: `apps/web-next/src/pages/transactions/list.tsx`
- Modify: `apps/web-next/src/pages/transactions/create.tsx`
- Reference: `apps/web-next/src/constants/transactionTypes.ts`

- [ ] **Step 1: Add explicit create URL context in `TransactionList`**

```ts
import { Button } from "antd";
import { useNavigate } from "react-router";

const navigate = useNavigate();
```

Then pass it to the list container:

```tsx
<List
  headerButtons={() => (
    <Button
      type="primary"
      onClick={() =>
        navigate(
          `/transactions/create?source=transactions-list&type=${transactionType}`
        )
      }
    >
      Create
    </Button>
  )}
>
```

- [ ] **Step 2: Parse and validate prefill query params in `TransactionCreate`**

```ts
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { TRANSACTION_TYPES, TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";

const [searchParams] = useSearchParams();

const initialType = useMemo(() => {
  const source = searchParams.get("source");
  const type = searchParams.get("type");
  const validTypes = new Set(Object.values(TRANSACTION_TYPES));

  if (source !== "transactions-list") return undefined;
  if (!type || !validTypes.has(type as (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES])) {
    return undefined;
  }

  return type;
}, [searchParams]);
```

- [ ] **Step 3: Apply `initialType` as form initial value**

```ts
const { formProps, saveButtonProps } = useForm({
  warnWhenUnsavedChanges: false,
  initialValues: initialType ? { type: initialType } : undefined,
});
```

Keep existing required `Type` rule unchanged so direct opens still require user selection.

- [ ] **Step 4: Run targeted type checks for changed app code**

Run:
```bash
cd apps/web-next
npm run check-types
```

Expected: PASS with no type errors in transactions pages.

- [ ] **Step 5: Re-run focused E2E tests for this behavior**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "preselects type|keeps type unselected"
```

Expected: PASS for both tests.

- [ ] **Step 6: Commit implementation changes**

```bash
git add \
  apps/web-next/src/pages/transactions/list.tsx \
  apps/web-next/src/pages/transactions/create.tsx
git commit -m "feat(transactions): prefill create type from list tab context"
```

### Task 3: Add invalid-query guard regression and finalize

**Files:**
- Modify: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Add invalid-query regression test**

```ts
test("invalid create query params do not preselect type", async ({ page }) => {
  await page.goto("/transactions/create?source=transactions-list&type=invalid");
  await expect(page.getByRole("heading", { name: "Create Transaction" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "* Type" })).toHaveText("");
});
```

- [ ] **Step 2: Run targeted regression trio**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "preselects type|keeps type unselected|invalid create query params"
```

Expected: PASS for all three tests.

- [ ] **Step 3: Commit final test coverage**

```bash
git add apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "test(transactions): cover invalid type-prefill query handling"
```

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/tx-create-type-prefill
gh pr create --fill
```

Expected: PR includes spec commit plus implementation/test commits for review.

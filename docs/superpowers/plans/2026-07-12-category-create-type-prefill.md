# Category Create Type Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill category Type on `/categories/create` only when the user arrives from the Categories list with a tab-selected type.

**Architecture:** Use an explicit query-string handoff from the Categories list to the create page. The create page validates that context, seeds the form initial value, and derives the parent-category dropdown filter from the current form value so the dropdown works immediately on load.

**Tech Stack:** TypeScript, React 19, Refine, Ant Design 5, react-router, Playwright

---

### Task 1: Add explicit category create navigation

**Files:**
- Modify: `apps/web-next/src/pages/categories/list.tsx`

- [ ] **Step 1: Update the list page create action to include the current tab type**

Replace the default `<List>` header create behavior with a button that navigates to `/categories/create?source=categories-list&type=<activeType>`.

```tsx
<List
  headerButtons={() => (
    <Button
      type="primary"
      onClick={() => {
        const params = new URLSearchParams({
          source: "categories-list",
          type: categoryType,
        });
        navigate(`/categories/create?${params.toString()}`);
      }}
    >
      Create
    </Button>
  )}
>
```

- [ ] **Step 2: Verify the list page still compiles cleanly**

Run: `cd apps/web-next && npm run check-types`
Expected: pass with no TypeScript errors in `pages/categories/list.tsx`.

### Task 2: Prefill category type and seed dependent dropdown state

**Files:**
- Modify: `apps/web-next/src/pages/categories/create.tsx`

- [ ] **Step 1: Add query-param parsing and type validation**

Read `source` and `type` from `useSearchParams`, validate against the existing transaction/category type constants, and compute a merged initial value only when the source is `categories-list`.

```tsx
const [searchParams] = useSearchParams();
const initialType = useMemo<string | undefined>(() => {
  const source = searchParams.get("source");
  const rawType = searchParams.get("type");

  if (source !== "categories-list") return undefined;
  if (!rawType || !VALID_TRANSACTION_TYPES.has(rawType)) return undefined;

  return rawType;
}, [searchParams]);
```

- [ ] **Step 2: Switch the parent-category filter from local mirrored state to form-driven state**

Use `Form.useWatch("type", formProps.form)` so the selected type is available on first render when the form has an initial value.

```tsx
const currentType = Form.useWatch("type", formProps.form) ?? initialType;
```

Then drive the `useSelect` filters and `queryOptions.enabled` from `currentType` instead of a separate `useState` mirror.

- [ ] **Step 3: Preserve the existing parent reset behavior on type change**

Keep the form `onValuesChange` handler so changing Type clears `parent_id`.

```tsx
onValuesChange={(changed) => {
  if (changed.type !== undefined) {
    formProps.form?.setFieldValue("parent_id", undefined);
  }
}}
```

- [ ] **Step 4: Verify the create page still compiles cleanly**

Run: `cd apps/web-next && npm run check-types`
Expected: pass with no TypeScript errors in `pages/categories/create.tsx`.

### Task 3: Add e2e coverage for the prefill flow

**Files:**
- Modify: `apps/web-next/e2e/tests/categories.spec.ts`

- [ ] **Step 1: Add a create-from-tab test**

Create a test that visits `/categories`, selects each category tab, clicks Create, and verifies the create form opens with the matching Type selected.

```ts
test("create from selected category tab preselects type", async ({ page }) => {
  await page.goto("/categories");
  await page.getByRole("radiogroup", { name: "segmented control" }).getByText(/earn/i).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/categories\/create\?source=categories-list&type=earn/);
  await expect(
    page.locator(".ant-select-selection-item").filter({ hasText: /^earn$/i })
  ).toBeVisible();
});
```

- [ ] **Step 2: Add a direct-create blank-state test**

Navigate directly to `/categories/create` and verify the Type field starts empty.

- [ ] **Step 3: Add an invalid-query-param test**

Navigate to `/categories/create?source=categories-list&type=invalid` and verify the Type field stays empty.

- [ ] **Step 4: Run the targeted categories e2e file**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/categories.spec.ts`
Expected: the category suite passes, including the new prefill coverage.

### Task 4: Final verification

**Files:**
- Modified: `apps/web-next/src/pages/categories/list.tsx`
- Modified: `apps/web-next/src/pages/categories/create.tsx`
- Modified: `apps/web-next/e2e/tests/categories.spec.ts`

- [ ] **Step 1: Run type checks once more**

Run: `cd apps/web-next && npm run check-types`
Expected: pass.

- [ ] **Step 2: Run the focused e2e suite once more**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/categories.spec.ts`
Expected: pass.

- [ ] **Step 3: Commit the implementation**

```bash
git add apps/web-next/src/pages/categories/list.tsx apps/web-next/src/pages/categories/create.tsx apps/web-next/e2e/tests/categories.spec.ts
git commit -m "feat(categories): prefill type from selected tab"
```

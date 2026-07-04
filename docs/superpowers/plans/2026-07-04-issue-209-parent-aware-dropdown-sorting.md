# Issue #209 Parent-Aware Dropdown Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make category dropdowns sort alphabetically by full hierarchy label (`Parent / Child`) and ensure bank account dropdown ordering is explicitly alphabetical everywhere relevant.

**Architecture:** Introduce a shared category sort key/comparator in `categoryHierarchy.ts` and use it in dropdown option builders instead of relying on backend/default ordering by raw name. Keep existing leaf-category filtering and search behavior unchanged, and add explicit `name ASC` sorting where bank account selects are missing sorters. Validate with focused Playwright coverage around dropdown ordering.

**Tech Stack:** TypeScript, React 19, Refine hooks (`useList`, `useSelect`), Ant Design `Select`, Playwright E2E.

---

### Task 1: Add failing E2E coverage for ordering

**Files:**
- Modify: `apps/web-next/e2e/tests/transactions.spec.ts`
- Reference: `apps/web-next/e2e/utils/test-helpers.ts`

- [ ] **Step 1: Write a failing ordering test in `transactions.spec.ts`**

```ts
test("transaction dropdowns sort categories by full hierarchy label and bank accounts alphabetically", async ({
  page,
}) => {
  const ts = Date.now();
  const parentName = `Utilities-${ts}`;
  const childA = `Heating-${ts}`;
  const childB = `Water-${ts}`;
  const standalone = `Vacation-${ts}`;

  await supabaseAdmin.from("categories").insert([
    { user_id: testUser.userId, type: "spend", name: parentName },
    { user_id: testUser.userId, type: "spend", name: standalone },
  ]);

  const { data: parent } = await supabaseAdmin
    .from("categories")
    .select("id")
    .eq("user_id", testUser.userId)
    .eq("name", parentName)
    .single();

  await supabaseAdmin.from("categories").insert([
    { user_id: testUser.userId, type: "spend", name: childA, parent_id: parent!.id },
    { user_id: testUser.userId, type: "spend", name: childB, parent_id: parent!.id },
  ]);

  await page.goto("/transactions/create");
  await page.waitForLoadState("networkidle");
  await selectFromVisibleAntdDropdown(page, "* Type", "spend");
  await page.getByRole("combobox", { name: "* Category" }).click();

  const visibleOptions = await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .allTextContents();

  const filtered = visibleOptions.filter(
    (text) =>
      text.includes("Utilities-") ||
      text.includes("Vacation-") ||
      text.includes("Heating-") ||
      text.includes("Water-")
  );

  expect(filtered).toEqual([
    `${parentName} / ${childA}`,
    `${parentName} / ${childB}`,
    standalone,
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails on current behavior**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "sort categories by full hierarchy label"
```

Expected: FAIL because options are currently ordered by raw `name`, not full display label.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "test(e2e): capture parent-aware category sorting regression"
```

### Task 2: Implement shared parent-aware category sort utility

**Files:**
- Modify: `apps/web-next/src/utility/categoryHierarchy.ts`
- Modify: `apps/web-next/src/pages/transactions/create.tsx`
- Modify: `apps/web-next/src/pages/transactions/edit.tsx`

- [ ] **Step 1: Add shared sort-key/comparator helpers**

```ts
export const categorySortKey = (category: Category): string =>
  categoryLabel(category).toLocaleLowerCase();

export const compareCategoriesByHierarchyLabel = (
  a: Category,
  b: Category
): number => categorySortKey(a).localeCompare(categorySortKey(b));
```

- [ ] **Step 2: Apply comparator before building transaction create options**

```ts
const leafCategoryOptions = (categoriesResult?.data ?? [])
  .filter(isLeafCategory)
  .sort(compareCategoriesByHierarchyLabel)
  .map((c: Category) => ({
    label: categoryLabel(c),
    value: c.id,
    searchText: categorySearchText(c),
  }));
```

- [ ] **Step 3: Apply comparator in transaction edit options (including current selected fallback path)**

```ts
const leaves = all
  .filter(isLeafCategory)
  .sort(compareCategoriesByHierarchyLabel)
  .map((c: Category) => ({
    label: formatCategoryLabel(c),
    value: c.id,
    searchText: getCategorySearchText(c),
  }));
```

- [ ] **Step 4: Make bank-account sorting explicit in transaction edit**

```ts
const { selectProps: bankAccountSelectProps } = useAntSelect({
  resource: "bank_accounts",
  defaultValue: transactionsData?.bank_account_id,
  optionLabel: "name",
  pagination: { mode: "off" },
  sorters: [{ field: "name", order: "asc" }],
});
```

- [ ] **Step 5: Run focused lint/type checks**

Run:
```bash
cd apps/web-next
npm run lint
npm run check-types
```

Expected: PASS with no new lint/type errors in changed files.

- [ ] **Step 6: Commit utility + transaction form changes**

```bash
git add \
  apps/web-next/src/utility/categoryHierarchy.ts \
  apps/web-next/src/pages/transactions/create.tsx \
  apps/web-next/src/pages/transactions/edit.tsx
git commit -m "fix(transactions): sort category and bank account dropdowns alphabetically"
```

### Task 3: Apply shared category sorting to other category dropdowns

**Files:**
- Modify: `apps/web-next/src/pages/transactions/list.tsx`
- Modify: `apps/web-next/src/pages/budgets/create.tsx`
- Modify: `apps/web-next/src/pages/budgets/edit.tsx`
- Modify: `apps/web-next/src/pages/categories/create.tsx`
- Modify: `apps/web-next/src/pages/categories/edit.tsx`

- [ ] **Step 1: Sort transaction list category filter options by hierarchy label**

```ts
const sortedCategoryOptions = [...(categorySelectProps.options ?? [])].sort((a, b) =>
  String(a?.label ?? "").localeCompare(String(b?.label ?? ""), undefined, {
    sensitivity: "base",
  })
);
```

Then pass `sortedCategoryOptions` to `MultiSelectFilter` for categories.

- [ ] **Step 2: Use `categories_with_usage` + shared comparator in budget category option builders**

```ts
const { query: categoriesQuery } = useList<Category>({
  resource: "categories_with_usage",
  pagination: { mode: "off" },
  filters: selectedType ? [{ field: "type", operator: "eq", value: selectedType }] : [],
});

const categoryOptions = useMemo(
  () =>
    (categoriesQuery.data?.data ?? [])
      .sort(compareCategoriesByHierarchyLabel)
      .map((c) => ({
        label: `${categoryLabel(c)} (${c.type})`,
        value: c.id as string,
      })),
  [categoriesQuery.data]
);
```

- [ ] **Step 3: Ensure parent category dropdowns in category create/edit are explicitly name-sorted**

```ts
const { selectProps: parentSelectProps } = useSelect({
  resource: "categories_with_usage",
  optionLabel: "name",
  optionValue: "id",
  sorters: [{ field: "name", order: "asc" }],
  // existing filters/queryOptions/pagination stay unchanged
});
```

- [ ] **Step 4: Run focused E2E coverage for dropdown flows**

Run:
```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "dropdown"
```

Expected: PASS, including the new ordering assertion.

- [ ] **Step 5: Commit cross-form dropdown consistency changes**

```bash
git add \
  apps/web-next/src/pages/transactions/list.tsx \
  apps/web-next/src/pages/budgets/create.tsx \
  apps/web-next/src/pages/budgets/edit.tsx \
  apps/web-next/src/pages/categories/create.tsx \
  apps/web-next/src/pages/categories/edit.tsx
git commit -m "fix(dropdowns): apply consistent category ordering across forms"
```

### Task 4: Final verification and handoff commit

**Files:**
- Modify (if needed): any file touched in Tasks 1-3

- [ ] **Step 1: Run targeted regression checks one more time**

Run:
```bash
cd apps/web-next
npm run check-types
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "category dropdown"
```

Expected: PASS with stable ordering behavior.

- [ ] **Step 2: Create final integration commit**

```bash
git add apps/web-next/src apps/web-next/e2e/tests
git commit -m "fix: resolve issue #209 dropdown ordering with parent-aware category sort"
```

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin fix/issue-209-dropdown-parent-aware-sort
gh pr create --fill --base main --head fix/issue-209-dropdown-parent-aware-sort
```

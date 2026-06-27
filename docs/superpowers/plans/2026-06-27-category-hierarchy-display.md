# Category Hierarchy Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show transaction categories as `Parent / Child` (or just `Name` for roots) consistently in transactions list, create/edit category selectors, and transaction details.

**Architecture:** Keep one frontend formatter (`categoryLabel`) as the single source of display truth, feed it parent context from query payloads, and keep selector search matching both parent and child tokens. Extend Supabase views to expose parent names where list/select surfaces currently only have child names.

**Tech Stack:** React 19 + Refine + Ant Design 5 (apps/web-next), Supabase Postgres views/migrations, Playwright E2E, TypeScript.

---

## File Structure and Responsibilities

- Modify: `apps/web-next/src/utility/categoryHierarchy.ts`
  - Canonical hierarchy label delimiter and search-token helper.
- Modify: `apps/web-next/src/pages/transactions/create.tsx`
  - Category dropdown labels/search behavior on create form.
- Modify: `apps/web-next/src/pages/transactions/edit.tsx`
  - Category dropdown labels/search behavior on edit form.
- Modify: `apps/web-next/src/pages/transactions/show.tsx`
  - Category details display with parent relation.
- Modify: `apps/web-next/src/pages/transactions/list.tsx`
  - List category column label rendering with parent context.
- Create: `supabase/migrations/20260627120000_transaction_category_parent_labels.sql`
  - Add parent-name fields to views used by transaction surfaces.
- Modify: `apps/web-next/src/types/database.types.ts`
  - Sync generated DB types after view shape changes.
- Modify: `apps/web-next/e2e/tests/transactions.spec.ts`
  - Failing-first and passing E2E coverage for hierarchy label rendering and search.

### Task 1: Add failing E2E coverage for hierarchical labels

**Files:**
- Modify: `apps/web-next/e2e/tests/transactions.spec.ts`
- Test: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Write failing tests for create/edit dropdown label + search**

```ts
test("category dropdown shows parent/child labels and supports parent-name search", async ({ page }) => {
  const ts = Date.now();
  const parentName = `Vacations-${ts}`;
  const childName = "Groceries";
  const note = `txn-hierarchy-search-${ts}`;

  const { data: parent } = await supabaseAdmin
    .from("categories")
    .insert({ user_id: testUser.userId, type: "spend", name: parentName })
    .select("id")
    .single();

  const { data: child } = await supabaseAdmin
    .from("categories")
    .insert({
      user_id: testUser.userId,
      type: "spend",
      name: childName,
      parent_id: parent!.id,
    })
    .select("id")
    .single();

  await page.goto("/transactions/create");
  await selectFromVisibleAntdDropdown(page, "* Type", "spend");
  await page.getByRole("combobox", { name: "* Category" }).click();

  await expect(
    page.locator(".ant-select-dropdown:visible").getByTitle(`${parentName} / ${childName}`)
  ).toBeVisible();

  await page.locator(".ant-select-dropdown:visible .ant-select-selection-search-input").fill("vacat");
  await expect(
    page.locator(".ant-select-dropdown:visible").getByTitle(`${parentName} / ${childName}`)
  ).toBeVisible();

  await createTransactionWithoutTags(
    page,
    e2eCurrentMonthDate(),
    "spend",
    `${parentName} / ${childName}`,
    "123.45",
    "Main Account",
    note
  );

  const row = getTransactionRow(page, { note, category: `${parentName} / ${childName}` });
  await row.getByRole("button", { name: "edit" }).click();
  await waitForTransactionEditReady(page);
  await expect(
    page.locator(".ant-select-selection-item").filter({ hasText: new RegExp(`${parentName} / ${childName}`) })
  ).toBeVisible();

  await supabaseAdmin.from("categories").delete().eq("id", child!.id);
  await supabaseAdmin.from("categories").delete().eq("id", parent!.id);
});
```

- [ ] **Step 2: Write failing tests for list/details labels and legacy slash names**

```ts
test("transactions list and details show consistent hierarchy label including legacy slash names", async ({ page }) => {
  const ts = Date.now();
  const parentName = `Category/Subcategory-${ts}`;
  const childName = "Groceries";
  const note = `txn-hierarchy-details-${ts}`;

  const { data: parent } = await supabaseAdmin
    .from("categories")
    .insert({ user_id: testUser.userId, type: "spend", name: parentName })
    .select("id")
    .single();

  const { data: child } = await supabaseAdmin
    .from("categories")
    .insert({
      user_id: testUser.userId,
      type: "spend",
      name: childName,
      parent_id: parent!.id,
    })
    .select("id")
    .single();

  const { data: account } = await supabaseAdmin
    .from("bank_accounts")
    .select("id")
    .eq("user_id", testUser.userId)
    .eq("name", "Main Account")
    .single();

  await supabaseAdmin.from("transactions").insert({
    user_id: testUser.userId,
    date: e2eCurrentMonthDate(),
    type: "spend",
    category_id: child!.id,
    bank_account_id: account!.id,
    amount: 87.0,
    notes: note,
  });

  await page.goto("/transactions");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radiogroup", { name: "segmented control" }).getByText(/^spend$/i).click();
  await expect(getTransactionRow(page, { note, category: `${parentName} / ${childName}` })).toBeVisible();

  const row = getTransactionRow(page, { note, category: `${parentName} / ${childName}` });
  await row.getByRole("button", { name: "show" }).click();
  await expect(page.getByText(`${parentName} / ${childName}`)).toBeVisible();
});
```

- [ ] **Step 3: Run targeted E2E to confirm failures**

Run:

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "hierarchy label|hierarchy"
```

Expected: FAIL because current UI still renders child-only labels and parent-name search does not match.

- [ ] **Step 4: Commit failing tests**

```bash
git add apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "test(e2e): add failing hierarchy category label coverage"
```

### Task 2: Implement shared label + selector behavior in create/edit/details

**Files:**
- Modify: `apps/web-next/src/utility/categoryHierarchy.ts`
- Modify: `apps/web-next/src/pages/transactions/create.tsx`
- Modify: `apps/web-next/src/pages/transactions/edit.tsx`
- Modify: `apps/web-next/src/pages/transactions/show.tsx`
- Test: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Implement delimiter and search helpers in category utility**

```ts
export const categoryLabel = (category: Category): string =>
  category.parent?.name ? `${category.parent.name} / ${category.name}` : category.name;

export const categorySearchText = (category: Category): string => {
  const parent = category.parent?.name ?? "";
  return `${parent} ${category.name}`.trim().toLowerCase();
};
```

- [ ] **Step 2: Update create form category options to use shared label + parent/child search**

```ts
const leafCategoryOptions = (categoriesResult?.data ?? [])
  .filter(isLeafCategory)
  .map((c: Category) => ({
    label: categoryLabel(c),
    value: c.id,
    searchText: categorySearchText(c),
  }));

<Select
  options={leafCategoryOptions}
  showSearch
  filterOption={(input, option) =>
    (option as { searchText?: string })?.searchText?.includes(input.toLowerCase()) ?? false
  }
/>;
```

- [ ] **Step 3: Update edit form category options to use shared label + parent/child search**

```ts
const leaves = all
  .filter(isLeafCategory)
  .map((c: Category) => ({
    label: categoryLabel(c),
    value: c.id,
    searchText: categorySearchText(c),
  }));

if (current) {
  leaves.unshift({
    label: categoryLabel(current),
    value: current.id,
    searchText: categorySearchText(current),
  });
}
```

- [ ] **Step 4: Update transaction details query/render to include parent and shared label**

```ts
const categoryQuery = useOne({
  resource: "categories",
  id: record?.category_id ?? "",
  meta: { select: "id,name,parent:parent_id(id,name)" },
  queryOptions: { enabled: !!record?.category_id },
});

{categoryIsLoading ? (
  <Skeleton.Input active size="small" style={{ width: 180 }} />
) : (
  <>{categoryData ? categoryLabel(categoryData as Category) : "—"}</>
)}
```

- [ ] **Step 5: Run targeted E2E to verify Task 2 surfaces pass**

Run:

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "dropdown shows parent/child|details show consistent"
```

Expected: PASS for create/edit/details hierarchy assertions; list assertions still may fail until Task 3 view/list changes.

- [ ] **Step 6: Commit Task 2 implementation**

```bash
git add \
  apps/web-next/src/utility/categoryHierarchy.ts \
  apps/web-next/src/pages/transactions/create.tsx \
  apps/web-next/src/pages/transactions/edit.tsx \
  apps/web-next/src/pages/transactions/show.tsx
git commit -m "feat(transactions): use hierarchy labels in forms and details"
```

### Task 3: Expose parent label data for transaction list and wire UI

**Files:**
- Create: `supabase/migrations/20260627120000_transaction_category_parent_labels.sql`
- Modify: `apps/web-next/src/types/database.types.ts`
- Modify: `apps/web-next/src/pages/transactions/list.tsx`
- Test: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Create migration that adds parent category name columns to views**

```sql
-- in new migration file
DROP VIEW IF EXISTS public.transactions_with_details;
CREATE VIEW public.transactions_with_details
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name AS category_name,
  p.name AS category_parent_name,
  c.type AS category_type,
  t.bank_account_id,
  ba.name AS bank_account_name,
  t.created_at,
  t.updated_at,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT tt.tag_id ORDER BY tt.tag_id), NULL) AS tag_ids,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT tg.name ORDER BY tg.name), NULL) AS tag_names
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.categories p ON c.parent_id = p.id
LEFT JOIN public.bank_accounts ba ON t.bank_account_id = ba.id
LEFT JOIN public.transaction_tags tt ON t.id = tt.transaction_id
LEFT JOIN public.tags tg ON tt.tag_id = tg.id
GROUP BY
  t.id, t.user_id, t.date, t.amount, t.notes, t.type, t.category_id,
  c.name, p.name, c.type, t.bank_account_id, ba.name, t.created_at, t.updated_at;

DROP VIEW IF EXISTS public.categories_with_usage;
CREATE VIEW public.categories_with_usage
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.user_id,
  c.type,
  c.name,
  c.description,
  c.parent_id,
  p.name AS parent_name,
  COALESCE(ch_kids.child_count, 0)::bigint AS child_count,
  c.created_at,
  c.updated_at,
  COALESCE(u.cnt, 0::bigint) AS in_use_count
FROM public.categories c
LEFT JOIN public.categories p ON c.parent_id = p.id
LEFT JOIN (
  SELECT
    public.transactions.user_id,
    public.transactions.category_id,
    count(*) AS cnt
  FROM public.transactions
  WHERE public.transactions.category_id IS NOT NULL
    AND public.transactions.deleted_at IS NULL
  GROUP BY public.transactions.user_id, public.transactions.category_id
) u ON u.user_id = c.user_id AND u.category_id = c.id
LEFT JOIN (
  SELECT ancestor_id, count(*) AS child_count
  FROM public.category_hierarchy
  WHERE depth = 1
  GROUP BY ancestor_id
) ch_kids ON ch_kids.ancestor_id = c.id
WHERE c.deleted_at IS NULL;
```

- [ ] **Step 2: Apply migration locally and regenerate DB types**

Run:

```bash
supabase migration up
supabase gen types typescript --local > types.gen.ts
```

Then sync app-local type file (`apps/web-next/src/types/database.types.ts`) via the repository’s existing type-sync workflow (or manual update) so these fields exist:

```ts
transactions_with_details: {
  Row: {
    amount: number | null;
    bank_account_id: string | null;
    bank_account_name: string | null;
    category_id: string | null;
    category_name: string | null;
    category_parent_name: string | null;
    category_type: Database["public"]["Enums"]["transaction_type"] | null;
    created_at: string | null;
    date: string | null;
    id: string | null;
    notes: string | null;
    tag_ids: string[] | null;
    tag_names: string[] | null;
    type: Database["public"]["Enums"]["transaction_type"] | null;
    updated_at: string | null;
    user_id: string | null;
  }
}

categories_with_usage: {
  Row: {
    id: string;
    user_id: string;
    type: Database["public"]["Enums"]["transaction_type"];
    name: string;
    description: string | null;
    parent_id: string | null;
    parent_name: string | null;
    child_count: number | null;
    created_at: string | null;
    updated_at: string | null;
    in_use_count: number | null;
  }
}
```

- [ ] **Step 3: Update list page rendering and filter option labels**

```ts
render={(_: unknown, record: BaseRecord) => {
  const parent = record.category_parent_name as string | null;
  const child = record.category_name as string | null;
  return parent && child ? `${parent} / ${child}` : (child ?? "—");
}}
```

And ensure category filter options render hierarchy label (using `parent_name` + `name`) rather than child-only names.

- [ ] **Step 4: Run focused checks**

Run:

```bash
cd apps/web-next
npm run check-types
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "hierarchy label|hierarchy"
```

Expected: PASS for list/form/details hierarchy coverage and no TypeScript errors.

- [ ] **Step 5: Commit DB + UI list integration**

```bash
git add \
  supabase/migrations/20260627120000_transaction_category_parent_labels.sql \
  apps/web-next/src/types/database.types.ts \
  apps/web-next/src/pages/transactions/list.tsx
git commit -m "feat(transactions): render parent-child category labels in list"
```

### Task 4: Final regression and release-ready verification

**Files:**
- Test: `apps/web-next/e2e/tests/transactions.spec.ts`
- Test: `supabase/tests/*.sql` (existing suite only)

- [ ] **Step 1: Run transaction-focused E2E subset**

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts
```

Expected: PASS including existing transaction CRUD flows and new hierarchy coverage.

- [ ] **Step 2: Run DB tests after view changes**

```bash
supabase test db
```

Expected: PASS with no regressions in RLS/view-dependent behavior.

- [ ] **Step 3: Commit final test adjustments (if any)**

```bash
git add apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "test(transactions): validate hierarchy category display end-to-end"
```

- [ ] **Step 4: Prepare PR summary notes**

```md
- Added consistent `Parent / Child` category labeling across transactions list/create/edit/show.
- Added parent+child search behavior in category selectors.
- Added legacy slash-in-name compatibility behavior without auto-splitting names.
- Added E2E coverage for hierarchical labels and search.
```

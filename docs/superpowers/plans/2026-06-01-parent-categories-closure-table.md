# Parent Categories (Closure Table) Implementation Plan

> **Status: ✅ COMPLETE — PR [#189](https://github.com/iguliaev/moneylens/pull/189) · 2026-06-13**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add parent/child categories with closure-table rollups, keep transactions leaf-only, and preserve bulk upload behavior with leaf category names.

**Architecture:** Extend the Supabase schema with a `category_hierarchy` closure table and DB-side invariants for 2-level hierarchy. Update category and transaction UI flows to expose hierarchy while enforcing leaf-only assignment. Keep budgets unchanged; adjust reporting and upload validation paths to remain compatible with hierarchy-aware categories.

**Tech Stack:** Supabase/PostgreSQL (migrations + pgTAP), React 19 + Refine + Ant Design 5, Playwright E2E

---

## File Structure and Responsibilities

- **Create** `supabase/migrations/20260601210000_add_category_hierarchy.sql`
  - Adds closure table, indexes, constraints/triggers, and helper SQL functions.
- **Create** `supabase/tests/category_hierarchy_test.sql`
  - pgTAP coverage for hierarchy invariants and rollup behavior.
- **Modify** `supabase/migrations/20260201164000_baseline_from_schemas.sql` (if repository policy requires baseline sync)
  - Mirror latest schema/function definitions used by tests/tooling.
- **Modify** `supabase/tests/bulk_insert_test.sql`
  - Add parent-category rejection for bulk transaction import.
- **Modify** `supabase/tests/bulk_upload_entities_test.sql`
  - Add integration assertion that parent category names are rejected in transaction rows.
- **Modify** `apps/web-next/src/types/database.types.ts`
  - Regenerated types including hierarchy objects and updated function signatures.
- **Create** `apps/web-next/src/utility/categoryHierarchy.ts`
  - Shared helpers (`isLeafCategory`, tree flattening/formatting).
- **Modify** `apps/web-next/src/pages/categories/create.tsx`
  - Optional parent selector filtered by type.
- **Modify** `apps/web-next/src/pages/categories/edit.tsx`
  - Parent selector with self-exclusion and type compatibility.
- **Modify** `apps/web-next/src/pages/categories/list.tsx`
  - Hierarchical rendering (parent with child rows/indent).
- **Modify** `apps/web-next/src/pages/categories/show.tsx`
  - Display parent metadata.
- **Modify** `apps/web-next/src/pages/transactions/create.tsx`
  - Category options restricted to leaves.
- **Modify** `apps/web-next/src/pages/transactions/edit.tsx`
  - Category options restricted to leaves.
- **Modify** `apps/web-next/src/utility/rpc.ts`
  - Keep bulk upload payload typing compatible (leaf category names only).
- **Modify** `apps/web-next/e2e/tests/categories.spec.ts`
  - Add parent/child creation and hierarchy display tests.
- **Modify** `apps/web-next/e2e/tests/transactions.spec.ts`
  - Add leaf-only category selection tests.
- **Modify** `apps/web-next/e2e/tests/bulk-upload.spec.ts`
  - Add parent-category upload rejection coverage.

---

### Task 1: Add schema primitives for category hierarchy

**Files:**
- Create: `supabase/migrations/20260601210000_add_category_hierarchy.sql`
- Test: `supabase/tests/category_hierarchy_test.sql`

- [x] **Step 1: Write failing pgTAP tests for hierarchy table + invariants**

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select tests.create_supabase_user('hier_user@test.com');
select tests.authenticate_as('hier_user@test.com');

insert into public.categories (id, type, name) values
  (gen_random_uuid(), 'spend', 'Utilities'),
  (gen_random_uuid(), 'spend', 'Electricity');

-- Fails before implementation: relation missing
select has_table('public', 'category_hierarchy', 'category_hierarchy table exists');
select col_is_pk('public', 'category_hierarchy', 'ancestor_id', 'ancestor in PK');
select col_is_pk('public', 'category_hierarchy', 'descendant_id', 'descendant in PK');

select * from finish();
rollback;
```

- [x] **Step 2: Run pgTAP test to verify failure**

Run: `supabase test db -- --include category_hierarchy_test.sql`  
Expected: FAIL with missing `category_hierarchy` objects.

- [x] **Step 3: Implement migration for closure table + indexes**

```sql
create table if not exists public.category_hierarchy (
  ancestor_id uuid not null references public.categories(id) on delete cascade,
  descendant_id uuid not null references public.categories(id) on delete cascade,
  depth int not null check (depth >= 0 and depth <= 1),
  primary key (ancestor_id, descendant_id)
);

create index if not exists idx_category_hierarchy_ancestor_depth
  on public.category_hierarchy(ancestor_id, depth);

create index if not exists idx_category_hierarchy_descendant_depth
  on public.category_hierarchy(descendant_id, depth);
```

- [x] **Step 4: Add hierarchy maintenance trigger helpers**

```sql
alter table public.categories add column if not exists parent_id uuid null
  references public.categories(id) on delete set null;

create or replace function public.sync_category_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.category_hierarchy
   where descendant_id = new.id and depth = 1;

  insert into public.category_hierarchy (ancestor_id, descendant_id, depth)
  values (new.id, new.id, 0)
  on conflict do nothing;

  if new.parent_id is not null then
    insert into public.category_hierarchy (ancestor_id, descendant_id, depth)
    values (new.parent_id, new.id, 1)
    on conflict do nothing;
  end if;

  return new;
end;
$$;
```

- [x] **Step 5: Re-run pgTAP and commit**

Run: `supabase test db -- --include category_hierarchy_test.sql`  
Expected: PASS for table/index/invariant checks.

```bash
git add supabase/migrations/20260601210000_add_category_hierarchy.sql supabase/tests/category_hierarchy_test.sql
git commit -m "feat(db): add category hierarchy closure table"
```

---

### Task 2: Enforce leaf-only and update server-side category resolution

**Files:**
- Modify: `supabase/migrations/20260601210000_add_category_hierarchy.sql`
- Modify: `supabase/migrations/20260201164000_baseline_from_schemas.sql`
- Modify: `supabase/tests/bulk_insert_test.sql`
- Modify: `supabase/tests/bulk_upload_entities_test.sql`

- [x] **Step 1: Write failing pgTAP test for parent-name rejection in bulk insert**

```sql
select throws_ok(
  $$ select bulk_insert_transactions(
    '[{"date":"2026-01-01","type":"spend","category":"Utilities","amount":10}]'::jsonb
  ) $$,
  'P0001',
  'Bulk insert failed with 1 error(s)',
  'Reject parent category names in bulk transactions'
);
```

- [x] **Step 2: Run targeted DB tests to confirm current failure mode**

Run: `supabase test db -- --include bulk_insert_test.sql --include bulk_upload_entities_test.sql`  
Expected: FAIL because parent categories are currently not distinguished from leaves.

- [x] **Step 3: Update `bulk_insert_transactions` category lookup to require leaves**

```sql
select c.id into v_category_id
from public.categories c
left join public.category_hierarchy ch
  on ch.ancestor_id = c.id and ch.depth = 1
where c.user_id = v_user_id
  and c.type = v_type
  and c.name = v_tx->>'category'
group by c.id
having count(ch.descendant_id) = 0
limit 1;

if v_category_id is null then
  v_errors := v_errors || jsonb_build_object(
    'index', v_idx,
    'error', format('Category "%s" not found as leaf for type "%s"', v_tx->>'category', v_type)
  );
  continue;
end if;
```

- [x] **Step 4: Add parent/type/depth integrity checks**

```sql
create or replace function public.validate_category_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_parent_type public.transaction_type;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Category cannot be parent of itself';
  end if;

  select type into v_parent_type from public.categories where id = new.parent_id;
  if v_parent_type is distinct from new.type then
    raise exception 'Parent category must have same type';
  end if;

  return new;
end;
$$;
```

- [x] **Step 5: Re-run DB tests and commit**

Run: `supabase test db -- --include category_hierarchy_test.sql --include bulk_insert_test.sql --include bulk_upload_entities_test.sql`  
Expected: PASS.

```bash
git add supabase/migrations/*.sql supabase/tests/bulk_insert_test.sql supabase/tests/bulk_upload_entities_test.sql
git commit -m "feat(db): enforce leaf-only category assignment for bulk uploads"
```

---

### Task 3: Expose hierarchy-aware category data to frontend

**Files:**
- Modify: `apps/web-next/src/types/database.types.ts`
- Create: `apps/web-next/src/utility/categoryHierarchy.ts`

- [x] **Step 1: Write failing type-level usage in helper**

```ts
// categoryHierarchy.ts (initial failing use)
import type { Tables } from "../types/database.types";
type Category = Tables<"categories">;

export const isLeafCategory = (_category: Category): boolean => {
  throw new Error("not implemented");
};
```

- [x] **Step 2: Run type check to confirm missing shape/functions**

Run: `cd apps/web-next && npm run check-types`  
Expected: FAIL in helper/consumers until types and helper logic are complete.

- [x] **Step 3: Regenerate DB types and implement helper**

```bash
supabase gen types typescript --local > types.gen.ts
```

```ts
// apps/web-next/src/utility/categoryHierarchy.ts
import type { Tables } from "../types/database.types";

export type Category = Tables<"categories"> & {
  parent?: Pick<Tables<"categories">, "id" | "name"> | null;
  child_count?: number | null;
};

export const isLeafCategory = (category: Category): boolean =>
  Number(category.child_count ?? 0) === 0;
```

- [x] **Step 4: Re-run type checks and commit**

Run: `cd apps/web-next && npm run check-types`  
Expected: PASS.

```bash
git add apps/web-next/src/types/database.types.ts apps/web-next/src/utility/categoryHierarchy.ts types.gen.ts
git commit -m "chore(types): add hierarchy-aware category typing"
```

---

### Task 4: Implement category CRUD/list/show hierarchy UX

**Files:**
- Modify: `apps/web-next/src/pages/categories/create.tsx`
- Modify: `apps/web-next/src/pages/categories/edit.tsx`
- Modify: `apps/web-next/src/pages/categories/list.tsx`
- Modify: `apps/web-next/src/pages/categories/show.tsx`
- Test: `apps/web-next/e2e/tests/categories.spec.ts`

- [x] **Step 1: Add failing E2E for parent-child category flow**

```ts
test("user can create parent and child categories", async ({ page }) => {
  // create parent Utilities, then child Electricity with parent selected
  // assert list renders hierarchy (child indented/linked to parent)
});
```

- [x] **Step 2: Run E2E to observe failure**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/categories.spec.ts -g "parent and child"`  
Expected: FAIL (no parent selector / no hierarchy rendering).

- [x] **Step 3: Implement parent selector in create/edit forms**

```tsx
<Form.Item label="Parent Category" name={["parent_id"]}>
  <Select
    allowClear
    options={parentOptions}
    placeholder="No parent (top-level category)"
  />
</Form.Item>
```

```ts
const parentOptions = (categories ?? [])
  .filter((c) => c.type === selectedType && c.id !== currentId)
  .map((c) => ({ label: c.name, value: c.id }));
```

- [x] **Step 4: Implement hierarchy-aware list/show rendering**

```tsx
<Table.Column
  dataIndex="name"
  title="Name"
  render={(value, record) =>
    record.parent_id ? <span style={{ paddingLeft: 16 }}>↳ {value}</span> : value
  }
/>
```

```tsx
<Title level={5}>Parent Category</Title>
<TextField value={record?.parent?.name ?? "—"} />
```

- [x] **Step 5: Re-run E2E + commit**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/categories.spec.ts`  
Expected: PASS.

```bash
git add apps/web-next/src/pages/categories/*.tsx apps/web-next/e2e/tests/categories.spec.ts
git commit -m "feat(categories): add parent-child hierarchy UI"
```

---

### Task 5: Enforce leaf-only category selection in transaction forms

**Files:**
- Modify: `apps/web-next/src/pages/transactions/create.tsx`
- Modify: `apps/web-next/src/pages/transactions/edit.tsx`
- Modify: `apps/web-next/src/utility/categoryHierarchy.ts`
- Test: `apps/web-next/e2e/tests/transactions.spec.ts`

- [x] **Step 1: Add failing E2E for selecting parent category in transaction form**

```ts
test("transaction form shows leaf categories only", async ({ page }) => {
  // seed parent Utilities + child Electricity
  // open transaction create, ensure Utilities is not selectable, Electricity is selectable
});
```

- [x] **Step 2: Run test and confirm failure**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "leaf categories only"`  
Expected: FAIL (current list includes all categories).

- [x] **Step 3: Filter select options to leaves**

```tsx
const leafCategoryOptions = (categorySelectProps.options ?? []).filter((opt) =>
  isLeafCategory(opt as unknown as Category)
);

<Select {...categorySelectProps} options={leafCategoryOptions} />
```

- [x] **Step 4: Run E2E and commit**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "leaf categories only"`  
Expected: PASS.

```bash
git add apps/web-next/src/pages/transactions/create.tsx apps/web-next/src/pages/transactions/edit.tsx apps/web-next/src/utility/categoryHierarchy.ts apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "feat(transactions): restrict category selection to leaves"
```

---

### Task 6: Preserve and verify bulk upload compatibility

**Files:**
- Modify: `apps/web-next/e2e/tests/bulk-upload.spec.ts`
- Modify: `supabase/tests/bulk_insert_test.sql`
- Modify: `supabase/tests/bulk_upload_entities_test.sql`

- [x] **Step 1: Add failing tests for parent-category upload rejection**

```ts
test("bulk upload rejects transaction rows referencing parent categories", async ({ page }) => {
  // upload fixture where transaction.category points to parent
  // expect error alert, no partial transaction insert
});
```

```sql
select throws_like(
  $$ select bulk_upload_data(jsonb_build_object(
      'transactions', '[{"date":"2026-01-01","type":"spend","amount":"20.00","category":"Utilities"}]'::jsonb
    )) $$,
  '%Category "Utilities" not found as leaf%',
  'bulk upload rejects parent category names'
);
```

- [x] **Step 2: Run targeted tests to confirm failures first**

Run: `supabase test db -- --include bulk_insert_test.sql --include bulk_upload_entities_test.sql`  
Expected: FAIL before server logic update is complete.

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/bulk-upload.spec.ts -g "parent categories"`  
Expected: FAIL before UI assertions align.

- [x] **Step 3: Align errors/messages and fixtures with new behavior**

```json
{
  "transactions": [
    {
      "date": "2026-01-01",
      "type": "spend",
      "amount": 20,
      "category": "Utilities"
    }
  ]
}
```

- [x] **Step 4: Re-run DB + E2E tests and commit**

Run: `supabase test db -- --include bulk_insert_test.sql --include bulk_upload_entities_test.sql`  
Expected: PASS.

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/bulk-upload.spec.ts`  
Expected: PASS.

```bash
git add supabase/tests/bulk_insert_test.sql supabase/tests/bulk_upload_entities_test.sql apps/web-next/e2e/tests/bulk-upload.spec.ts
git commit -m "test: cover bulk upload behavior with category hierarchy"
```

---

### Task 7: Full verification and final integration commit

**Files:**
- Modify: all touched files from Tasks 1-6

- [x] **Step 1: Run app checks**

Run: `cd apps/web-next && npm run check-types && npm run lint && npm run build`  
Expected: all PASS.

- [x] **Step 2: Run focused E2E suite for touched areas**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/categories.spec.ts e2e/tests/transactions.spec.ts e2e/tests/bulk-upload.spec.ts`  
Expected: PASS.

- [x] **Step 3: Run DB tests**

Run: `supabase test db -- --include category_hierarchy_test.sql --include bulk_insert_test.sql --include bulk_upload_entities_test.sql`  
Expected: PASS.

- [x] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: add parent category hierarchy with leaf-only transaction assignment"
```

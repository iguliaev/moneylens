# Content Width Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the selected MoneyLens authenticated pages inside a shared finefoods-style max-width wrapper without changing auth pages or the dashboard.

**Architecture:** Add one reusable wrapper component that owns the width constraint and applies it at the route boundary. Wire that wrapper only around transactions, categories, budgets, tags, and settings so the page internals stay untouched and the layout decision stays centralized.

**Tech Stack:** React 19, React Router, Refine, Ant Design, Playwright.

---

### Task 1: Adding a shared page-width wrapper component

**Files:**
- Create: `apps/web-next/src/components/page-width-shell/index.tsx`
- Modify: `apps/web-next/src/components/index.ts`

- [ ] **Step 1: Add the wrapper component**

```tsx
import type { PropsWithChildren } from "react";

export const PageWidthShell = ({ children }: PropsWithChildren) => {
  return (
    <div
      data-testid="page-width-shell"
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
};
```

- [ ] **Step 2: Export the wrapper from the component barrel**

```ts
export { PageWidthShell } from "./page-width-shell";
```

- [ ] **Step 3: Run a focused type-check on the new component export**

Run: `cd apps/web-next && npm run check-types`
Expected: PASS

- [ ] **Step 4: Commit the wrapper component**

```bash
git add apps/web-next/src/components/page-width-shell/index.tsx apps/web-next/src/components/index.ts
git commit -m "feat(web-next): add shared page width shell"
```

### Task 2: Wrapping only the selected authenticated pages

**Files:**
- Modify: `apps/web-next/src/App.tsx`

- [ ] **Step 1: Wrap the selected route groups with `PageWidthShell`**

```tsx
import { PageWidthShell } from "./components";

// ...

<Route
  path="transactions"
  element={
    <PageWidthShell>
      <Outlet />
    </PageWidthShell>
  }
>
  <Route index element={<TransactionList />} />
  <Route path="create" element={<TransactionCreate />} />
  <Route path="edit/:id" element={<TransactionEdit />} />
  <Route path="show/:id" element={<TransactionShow />} />
</Route>

<Route
  path="categories"
  element={
    <PageWidthShell>
      <Outlet />
    </PageWidthShell>
  }
>
  <Route index element={<CategoryList />} />
  <Route path="create" element={<CategoryCreate />} />
  <Route path="edit/:id" element={<CategoryEdit />} />
  <Route path="show/:id" element={<CategoryShow />} />
</Route>

<Route
  path="budgets"
  element={
    <PageWidthShell>
      <Outlet />
    </PageWidthShell>
  }
>
  <Route index element={<BudgetList />} />
  <Route path="create" element={<BudgetCreate />} />
  <Route path="edit/:id" element={<BudgetEdit />} />
  <Route path="show/:id" element={<BudgetShow />} />
</Route>

<Route
  path="tags"
  element={
    <PageWidthShell>
      <Outlet />
    </PageWidthShell>
  }
>
  <Route index element={<TagList />} />
  <Route path="create" element={<TagCreate />} />
  <Route path="edit/:id" element={<TagEdit />} />
  <Route path="show/:id" element={<TagShow />} />
</Route>

<Route
  path="settings"
  element={
    <PageWidthShell>
      <SettingsPage />
    </PageWidthShell>
  }
/>
```

- [ ] **Step 2: Leave the dashboard and auth route trees unchanged**

Do not add the wrapper around the dashboard index route or any `/login`, `/register`, `/forgot-password`, or `/update-password` route.

- [ ] **Step 3: Run a focused type-check**

Run: `cd apps/web-next && npm run check-types`
Expected: PASS

- [ ] **Step 4: Commit the route wiring**

```bash
git add apps/web-next/src/App.tsx
git commit -m "feat(web-next): center selected authenticated pages"
```

### Task 3: Adding Playwright coverage for wrapped and unwrapped pages

**Files:**
- Create: `apps/web-next/e2e/tests/content-width.spec.ts`

- [ ] **Step 1: Write the failing Playwright smoke test**

```ts
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

test.describe("Content width shell", () => {
  test("selected authenticated pages use the shared width shell", async ({ page }) => {
    const { email, password, userId } = await createTestUser();

    try {
      await loginUser(page, email, password);

      for (const path of [
        "/transactions",
        "/categories",
        "/budgets",
        "/tags",
        "/settings",
      ]) {
        await page.goto(path);

        const shell = page.getByTestId("page-width-shell");
        await expect(shell).toBeVisible();
        await expect(shell).toHaveCSS("max-width", "1200px");
      }
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("login page does not use the shared width shell", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByTestId("page-width-shell")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the new spec and confirm it fails before implementation is finished**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/content-width.spec.ts`
Expected: FAIL until Tasks 1 and 2 are complete

- [ ] **Step 3: After the wrapper and route wiring are in place, rerun the same spec**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/content-width.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit the test coverage**

```bash
git add apps/web-next/e2e/tests/content-width.spec.ts
git commit -m "test(web-next): cover centered page width shell"
```

### Task 4: Final validation

**Files:**
- None

- [ ] **Step 1: Run the repo checks that cover the changed surface**

Run:
```bash
cd apps/web-next
npm run check-types
npm run lint -- src/App.tsx src/components/page-width-shell/index.tsx e2e/tests/content-width.spec.ts
npm run test:e2e:ci -- e2e/tests/content-width.spec.ts
```
Expected: all pass

- [ ] **Step 2: Confirm the visual scope matches the spec**

Check that `/transactions`, `/categories`, `/budgets`, `/tags`, and `/settings` are centered, while `/login` and `/` are unchanged.

- [ ] **Step 3: Commit any final adjustments**
If validation finds a small follow-up fix, commit only the touched files with explicit paths and keep the commit message scoped to that fix.

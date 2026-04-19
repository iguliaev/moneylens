---
name: e2e-tests
description: Implement, fix, or refactor end-to-end Playwright tests for the web-next application. Use when asked to write tests, add coverage, fix flaky tests, or update tests after a feature change. Trigger phrases - "write e2e tests for X", "add playwright tests", "test this feature", "this test is failing/flaky", "update tests for the new X page".
---

# End-to-End Test Implementation

## Overview
Implement, refactor, and maintain end-to-end tests for the web-next Web Application using Playwright. These tests ensure that the application functions correctly from the user's perspective.

The web application under test is apps/web-next - Typescript/React based application that uses Vite and built with Refine framework. Antd is used as the UI component library, Playwright is used for end-to-end testing. NPM is used as the package manager.
The application structure is as follows:
- apps/web-next/: Main web application codebase.
- apps/web-next/e2e/: End-to-end test suite using Playwright.
- apps/web-next/src/: Source code for the web application.


## When to Use
- When adding new features to the web-next application.
- When refactoring existing features to ensure no regressions occur.
- When fixing bugs that may affect user workflows.
- User asks "Create end-to-end tests for the web-next application", "Implement Playwright tests for web-next", "Update e2e tests for new web-next features" and similar requests.

## Step-by-Step Workflow

### 1. Identify Test Scenarios
- Review the feature, bugfix, or workflow to determine what user-visible behaviors need to be tested.
- Focus on end-to-end flows that a real user would perform.

### 2. Create or Update Test Files
- Place new tests in `apps/web-next/e2e/tests/`.
- Update existing tests to cover new or changed behaviors.
- Name test files and test cases descriptively - `<functionality>.spec.ts`. E.g., `tags.spec.ts`, `bank-accounts.spec.ts`, `user-data-isolation.spec.ts`.

### 3. Follow Playwright Testing Philosophy
- **Test user-visible behavior:** Write tests that interact with the application as a user would (e.g., via UI, not internal APIs).
- **Isolate tests:** Ensure each test is independent and does not rely on the state left by other tests. Use setup/teardown as needed.
- **Avoid testing third-party dependencies:** Only test your application's integration with third-party services, not the services themselves.

### 4. Apply Playwright Best Practices
- **Use locators:** Prefer `getByRole` and other semantic locators for selecting elements. Avoid brittle selectors like CSS classes or IDs unless necessary.
- **Use web-first assertions:** Always use Playwright's built-in assertions (e.g., `await expect(locator).toBeVisible()`) to wait for UI state changes.
- **Keep tests readable and maintainable:** Use clear, concise steps and comments where helpful.

### 5. Refactor Common Functionality
- Extract repeated logic (e.g., user creation, login, cleanup) into helper functions.
- Place shared helpers in `apps/web-next/e2e/utilities/` for reuse across tests.
- When refactoring existing tests DO NOT fall back to test ids or brittle selectors. Instead, improve the test by using semantic locators and helper functions.

### 6. Run and Validate Tests
- Start the development server (`npm run dev`) before running tests, or use automation tools like `start-server-and-test`.
- Run tests with `npm run tests:e2e` and ensure all pass.
- Fix any flaky or failing tests before merging changes.

### 7. Review and Maintain
- Regularly review tests for coverage and reliability.
- Update or refactor tests as the application evolves.

## Useful Patterns
** Check Item Is Visible In The Table **

```typescript
  await expect(
    page.getByRole("cell", { name: name, exact: true }),
  ).toBeVisible();

```

** Select Transaction Type Tab **

```typescript
  await page
    .getByRole("radiogroup", { name: "segmented control" })
    .getByText(new RegExp(type, "i"))
    .click();
```

** Check The Loaded Show Page Is Correct **

```typescript
  await expect(page).toHaveURL(/\/categories/);
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
```

** Check The Loaded Edit Page Is Correct **

```typescript
  await expect(page).toHaveURL(/\/categories/);
  await expect(page.getByRole("heading", { name: "Edit Categories" })).toBeVisible();
```

** Check The Loaded Create Page Is Correct **

```typescript
  await expect(page).toHaveURL(/\/categories/);
  await expect(page.getByRole("heading", { name: "Create Categories" })).toBeVisible();
```

** Click On Action Button In Table Row **

```typescript
  // Click on Edit button in the row with the given name
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "edit" })
    .click();
```

```typescript
    // Click on View button in the row with the given name
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "eye" })
    .click();
```

```typescript
    // Click on Delete button in the row with the given name
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "delete" })
    .click();
```

** Handle Confirmation Modal **

```typescript
  // Confirm deletion in the modal
  await expect(page.getByText("Are you sure?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
```

** Locate Empty Selector **
```typescript
  await page.getByRole("combobox", { name: "* Type" }).click();
```

** Select an Option from an Ant Design Dropdown **

Always scope the option click to `.ant-select-dropdown:visible` and use an anchored regex. This is the correct pattern for clicking an option in an open Ant Design `<Select>` dropdown:

```typescript
  // Open the dropdown first
  await page.getByRole("combobox", { name: "* Type" }).click({ force: true });

  // Then click the option scoped to the visible dropdown
  const option = page
    .locator(".ant-select-dropdown:visible")
    .getByTitle(new RegExp(`^${categoryType}$`, "i"));
  await option.waitFor({ state: "visible" });
  await option.click();
```

**Why NOT `getByText`:**
- `getByText(new RegExp(categoryType, "i"))` matches every element on the page that contains the text — including the combobox display value, table cells, labels, and other unrelated text. This causes ambiguous multi-match errors and, worse, may silently click the wrong element.
- After an option is clicked, Ant Design briefly keeps the dropdown in the DOM while animating out. The newly selected value also appears in `.ant-select-selection-item` on the same frame. A `getByText` query at that moment resolves to multiple elements and the click lands on the detaching dropdown node, not the target — causing the "element detached from DOM" flake.
- Scoping to `.ant-select-dropdown:visible` guarantees the locator only matches the open dropdown overlay, making the click unambiguous and stable.

**Verify the selection after clicking** using `.ant-select-selection-item`, not the combobox input (which is always empty in Ant Design):

```typescript
  await expect(
    page.locator(".ant-select-selection-item").filter({ hasText: new RegExp(`^${categoryType}$`, "i") })
  ).toBeVisible();
```

** Handle Ant Design Form Validation Errors **

Always use `getByRole("alert")` to assert validation errors — never `getByText` with the hardcoded message string:

```typescript
// Submit empty form to trigger validation
await page.getByRole("button", { name: /save/i }).click();

// Assert the error is visible
await expect(page.getByRole("alert").first()).toBeVisible();

// Assert the error disappears after filling the field
await page.getByRole("textbox", { name: "* Name" }).fill("some value");
await expect(page.getByRole("alert")).toHaveCount(0);
```

**Why NOT `getByText("'name' is required")`:**
- Ant Design's default validation message (`'name' is required`) is generated from the field name and can change if the field label, locale, or validation config changes — breaking the test silently.
- `getByRole("alert")` is the semantic locator for Ant Design's `<Form.Item>` error nodes and is stable regardless of message content or locale.
- If you need to assert a *specific* error message (e.g. to distinguish between two errors), use `getByRole("alert").filter({ hasText: /required/i })` rather than exact string matching.

---
**Summary:**
Always write Playwright E2E tests that:
- Test real user behavior
- Are isolated and reliable
- Use semantic locators and web-first assertions
- Refactor common logic into helpers in the utilities folder



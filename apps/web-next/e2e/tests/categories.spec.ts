import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  createCategoryForType,
  waitForFormReady,
  selectFromVisibleAntdDropdown,
  supabaseAdmin,
} from "../utils/test-helpers";

test.describe("Categories", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser();
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  [
    { categoryType: "spend" },
    { categoryType: "earn" },
    { categoryType: "save" },
  ].forEach(({ categoryType }) => {
    test(`user can create ${categoryType} category`, async ({ page }) => {
      const ts = Date.now();

      const name = `e2e-category-create-${categoryType}-name-${ts}`;
      const desc = `e2e-category-create-${categoryType}-desc-${ts}`;

      await createCategoryForType(page, categoryType, name, desc);
    });
  });

  test("user can edit a category", async ({ page }) => {
    const ts = Date.now();
    const categoryType = "earn";
    const name = `e2e-category-edit-name-${ts}`;
    const desc = `e2e-category-edit-desc-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedDesc = `${desc}-updated`;

    await createCategoryForType(page, categoryType, name, desc);

    // Click edit on the created category
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "edit" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Edit Category" })
    ).toBeVisible();

    // Wait for form to finish loading initial data
    await waitForFormReady(page, "category-edit-form");

    // Change category type
    const newCategoryType = "save";
    await page.getByRole("combobox", { name: /type/i }).click({ force: true });
    await page.getByTitle(new RegExp(newCategoryType, "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp(newCategoryType, "i"))
    ).toBeVisible();

    // Update fields
    await page.getByLabel("Name").clear();
    await page.getByLabel("Name").fill(updatedName);
    await page.getByLabel("Description").clear();
    await page.getByLabel("Description").fill(updatedDesc);

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Verify redirect back to categories list
    await expect(page).toHaveURL(/\/categories/);
    await expect(
      page.getByRole("heading", { name: "Categories" })
    ).toBeVisible();

    // Old values gone
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(categoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: name, exact: true })
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: desc, exact: true })
    ).not.toBeVisible();

    // Verify updated values visible under new category type
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(newCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: updatedName, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: updatedDesc, exact: true })
    ).toBeVisible();
  });

  [
    { categoryType: "spend" },
    { categoryType: "earn" },
    { categoryType: "save" },
  ].forEach(({ categoryType }) => {
    test(`user can delete ${categoryType} category`, async ({ page }) => {
      const ts = Date.now();
      const name = `e2e-category-delete-${categoryType}-name-${ts}`;

      await createCategoryForType(page, categoryType, name);

      // Select the type tab to filter categories
      await page
        .getByRole("radiogroup", { name: "segmented control" })
        .getByText(new RegExp(categoryType, "i"))
        .click();

      // Delete
      await page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("button", { name: "delete" })
        .click();

      // Handle confirmation
      await expect(page.getByText("Are you sure?")).toBeVisible();
      await page.getByRole("button", { name: "Delete", exact: true }).click();

      // Verify deleted
      await expect(
        page.getByRole("cell", { name: name, exact: true })
      ).not.toBeVisible();
    });
  });

  test("categories are filtered by type", async ({ page }) => {
    const ts = Date.now();

    const spendCategoryType = "spend";
    const earnCategoryType = "earn";
    const saveCategoryType = "save";

    const spendCategoryName = `e2e-category-filtering-${spendCategoryType}-name-${ts}`;
    const earnCategoryName = `e2e-category-filtering-${earnCategoryType}-name-${ts}`;
    const saveCategoryName = `e2e-category-filtering-${saveCategoryType}-name-${ts}`;

    await createCategoryForType(page, spendCategoryType, spendCategoryName);
    await createCategoryForType(page, earnCategoryType, earnCategoryName);
    await createCategoryForType(page, saveCategoryType, saveCategoryName);

    await page.goto("/categories");

    // Select the Spend tab to filter categories
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(spendCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: spendCategoryName, exact: true })
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: earnCategoryName, exact: true })
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: saveCategoryName, exact: true })
    ).not.toBeVisible();

    // Select the Earn tab to filter categories
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(earnCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: earnCategoryName, exact: true })
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: spendCategoryName, exact: true })
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: saveCategoryName, exact: true })
    ).not.toBeVisible();

    // Select the Save tab to filter categories
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(saveCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: saveCategoryName, exact: true })
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: earnCategoryName, exact: true })
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: spendCategoryName, exact: true })
    ).not.toBeVisible();
  });

  test("switching category type resets pagination and avoids 416", async ({
    page,
  }) => {
    let hasRange416 = false;
    page.on("response", (response) => {
      if (
        response.url().includes("/categories_with_usage") &&
        response.status() === 416
      ) {
        hasRange416 = true;
      }
    });

    const ts = Date.now();
    const now = new Date().toISOString();
    const categoryPrefix = `e2e-category-pagination-${ts}-`;
    const extraSpendCategories = Array.from({ length: 11 }).map((_, index) => ({
      user_id: testUser.userId,
      type: "spend" as const,
      name: `${categoryPrefix}${index + 1}`,
      description: "pagination-regression",
      created_at: now,
      updated_at: now,
    }));

    try {
      const { error: categoriesError } = await supabaseAdmin
        .from("categories")
        .insert(extraSpendCategories);
      if (categoriesError) {
        throw new Error(
          `Failed to seed pagination categories: ${categoriesError.message}`
        );
      }

      await page.goto("/categories");
      await page.waitForLoadState("networkidle");

      await page
        .getByRole("radiogroup", { name: "segmented control" })
        .getByText(/^spend$/i)
        .click();
      await page.waitForLoadState("networkidle");

      const secondPageButton = page
        .locator(".ant-pagination-item")
        .filter({ hasText: /^2$/ })
        .first();
      await expect(secondPageButton).toBeVisible();
      await secondPageButton.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/currentPage=2/);

      await page
        .getByRole("radiogroup", { name: "segmented control" })
        .getByText(/^earn$/i)
        .click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/currentPage=1/);
      expect(hasRange416).toBeFalsy();
    } finally {
      await supabaseAdmin
        .from("categories")
        .delete()
        .eq("user_id", testUser.userId)
        .like("name", `${categoryPrefix}%`);
    }
  });

  [
    { categoryType: "spend" },
    { categoryType: "earn" },
    { categoryType: "save" },
  ].forEach(({ categoryType }) => {
    test(`user can view category ${categoryType} details`, async ({ page }) => {
      const ts = Date.now();
      const categoryType = "save";
      const name = `e2e-category-show-${categoryType}-name-${ts}`;
      const desc = `e2e-category-show-${categoryType}-desc-${ts}`;

      await createCategoryForType(page, categoryType, name, desc);

      // Click show button
      await page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("button", { name: "eye" })
        .click();

      // Should navigate to show page
      await expect(
        page.getByRole("heading", { name: "Show Category" })
      ).toBeVisible();

      // Verify details shown
      await expect(page.getByText(categoryType, { exact: true })).toBeVisible();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByText(desc, { exact: true })).toBeVisible();
    });
  });

  test("user can create parent and child categories", async ({ page }) => {
    const ts = Date.now();
    const parentName = `e2e-parent-${ts}`;
    const childName = `e2e-child-${ts}`;
    const categoryType = "spend";

    // Create parent category (no parent selected)
    await createCategoryForType(page, categoryType, parentName);

    // Create child category with parent selected
    await page.goto("/categories");
    await page.getByRole("button", { name: /create/i }).click();
    await expect(
      page.getByRole("heading", { name: "Create Category" })
    ).toBeVisible();

    await selectFromVisibleAntdDropdown(page, "* Type", categoryType);

    await page.getByRole("textbox", { name: "* Name" }).fill(childName);

    // Select parent
    await selectFromVisibleAntdDropdown(page, "Parent Category", parentName);

    await page.getByRole("button", { name: /save/i }).click();

    await expect(page).toHaveURL(/\/categories/);
    await expect(
      page.getByRole("heading", { name: "Categories" })
    ).toBeVisible();

    // Switch to spend tab and verify hierarchy rendering
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(/spend/i)
      .click();

    // Parent row should be visible (plain name, no indent)
    await expect(
      page.getByRole("cell", { name: parentName, exact: true })
    ).toBeVisible();

    // Child row should be visible with indent marker
    await expect(page.getByText(`↳ ${childName}`)).toBeVisible();
  });

  test("show page displays parent category name", async ({ page }) => {
    const ts = Date.now();
    const parentName = `e2e-show-parent-${ts}`;
    const childName = `e2e-show-child-${ts}`;
    const categoryType = "earn";

    // Create parent
    await createCategoryForType(page, categoryType, parentName);

    // Create child
    await page.goto("/categories");
    await page.getByRole("button", { name: /create/i }).click();
    await selectFromVisibleAntdDropdown(page, "* Type", categoryType);
    await page.getByRole("textbox", { name: "* Name" }).fill(childName);
    await selectFromVisibleAntdDropdown(page, "Parent Category", parentName);
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/categories/);

    // Switch to earn tab
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(/earn/i)
      .click();

    // Open show for child
    await page
      .getByRole("row")
      .filter({ hasText: childName })
      .getByRole("button", { name: "eye" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Show Category" })
    ).toBeVisible();

    // Parent name should be visible on show page
    await expect(page.getByText("Parent Category")).toBeVisible();
    await expect(page.getByText(parentName)).toBeVisible();
  });
});

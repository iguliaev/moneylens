import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  createCategoryForType,
} from "../utils/test-helpers";
import { create } from "node:domain";

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
      page.getByRole("heading", { name: "Edit Category" }),
    ).toBeVisible();

    // Change category type
    const newCategoryType = "save";
    await page.getByText(new RegExp(categoryType, "i")).click();
    await page.getByTitle(new RegExp(newCategoryType, "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp(newCategoryType, "i")),
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
    await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

    // Old values gone
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(categoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: desc, exact: true }),
    ).not.toBeVisible();

    // Verify updated values visible under new category type
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(newCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: updatedName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: updatedDesc, exact: true }),
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
        page.getByRole("cell", { name: name, exact: true }),
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
      page.getByRole("cell", { name: spendCategoryName, exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: earnCategoryName, exact: true }),
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: saveCategoryName, exact: true }),
    ).not.toBeVisible();

    // Select the Earn tab to filter categories
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(earnCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: earnCategoryName, exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: spendCategoryName, exact: true }),
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: saveCategoryName, exact: true }),
    ).not.toBeVisible();

    // Select the Save tab to filter categories
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp(saveCategoryType, "i"))
      .click();

    await expect(
      page.getByRole("cell", { name: saveCategoryName, exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: earnCategoryName, exact: true }),
    ).not.toBeVisible();

    await expect(
      page.getByRole("cell", { name: spendCategoryName, exact: true }),
    ).not.toBeVisible();
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
        page.getByRole("heading", { name: "Show Category" }),
      ).toBeVisible();

      // Verify details shown
      await expect(page.getByText(categoryType, { exact: true })).toBeVisible();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByText(desc, { exact: true })).toBeVisible();
    });
  });
});

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
} from "../utils/test-helpers";

test.describe("Settings: Categories", () => {
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

  test("user can create a category", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-category-${ts}`;
    const desc = `e2e-category-desc-${ts}`;

    await page.goto("/categories");

    // Click create button
    await page.getByRole("button", { name: /create/i }).click();

    // Fill form
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Spend" }).click();

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(desc);

    // Submit
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to list
    await expect(page).toHaveURL(/\/categories/);

    // Verify category appears in list
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(desc)).toBeVisible();
  });

  test("user can edit a category", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-category-edit-${ts}`;
    const desc = `e2e-category-desc-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedDesc = `${desc}-updated`;

    // Create category
    await page.goto("/categories/create");
    await page.getByLabel("Type").selectOption("earn");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(desc);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/categories/);

    // Click edit on first row
    await page.getByRole("button", { name: /edit/i }).first().click();

    // Update fields
    await page.getByLabel("Name").clear();
    await page.getByLabel("Name").fill(updatedName);
    await page.getByLabel("Description").clear();
    await page.getByLabel("Description").fill(updatedDesc);

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Verify updated
    await expect(page).toHaveURL(/\/categories/);
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(updatedDesc)).toBeVisible();

    // Old values gone
    await expect(page.getByText(name)).not.toBeVisible();
  });

  test("user can delete a category", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-category-delete-${ts}`;

    // Create category
    await page.goto("/categories/create");
    await page.getByLabel("Type").selectOption("save");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/categories/);

    // Verify it exists
    await expect(page.getByText(name)).toBeVisible();

    // Delete
    await page.getByRole("button", { name: /delete/i }).first().click();

    // Handle confirmation if needed
    try {
      await page.getByRole("button", { name: /ok|confirm|yes/i }).click();
    } catch {
      // No confirmation dialog
    }

    // Verify deleted
    await expect(page.getByText(name)).not.toBeVisible();
  });

  test("categories are filtered by type", async ({ page }) => {
    const ts = Date.now();

    // Create a spend category
    await page.goto("/categories/create");
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Name").fill(`spend-${ts}`);
    await page.getByRole("button", { name: /save/i }).click();

    // Switch to earn tab
    await page.getByRole("tab", { name: /earn/i }).click();

    // Should not see spend category
    await expect(page.getByText(`spend-${ts}`)).not.toBeVisible();

    // Create an earn category
    await page.getByRole("button", { name: /create/i }).click();
    await page.getByLabel("Type").selectOption("earn");
    await page.getByLabel("Name").fill(`earn-${ts}`);
    await page.getByRole("button", { name: /save/i }).click();

    // Should see earn category
    await expect(page.getByText(`earn-${ts}`)).toBeVisible();

    // Switch back to spend tab
    await page.getByRole("tab", { name: /spend/i }).click();

    // Should see spend category again
    await expect(page.getByText(`spend-${ts}`)).toBeVisible();
  });

  test("user can view category details", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-category-show-${ts}`;

    // Create category
    await page.goto("/categories/create");
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(`description-${ts}`);
    await page.getByRole("button", { name: /save/i }).click();

    // Click show button
    await page.getByRole("button", { name: /show/i }).first().click();

    // Should navigate to show page
    await expect(page).toHaveURL(/\/categories\/show\//);

    // Verify details shown
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(`description-${ts}`)).toBeVisible();
  });
});

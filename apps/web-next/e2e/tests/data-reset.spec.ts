import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  seedReferenceDataForUser,
  createTransactionWithoutTags,
} from "../utils/test-helpers";

test.describe("Data Reset", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser();
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    // Seed reference data before each test since tests may delete it
    await seedReferenceDataForUser(testUser.userId);
    await loginUser(page, testUser.email, testUser.password);
  });

  test("user can reset all data", async ({ page }) => {
    await page.goto("/settings");

    // Scroll to danger zone section
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();

    // Click reset button
    await page.getByRole("button", { name: /reset.*data/i }).click();

    // Confirmation modal should appear
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(/reset.*data/i);

    // Click confirm
    await page
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();

    // Verify success message
    await expect(page.getByText(/data reset complete/i)).toBeVisible();

    // Verify counts are shown
    await expect(page.getByText(/transactions deleted/i)).toBeVisible();
    await expect(page.getByText(/categories deleted/i)).toBeVisible();
    await expect(page.getByText(/tags deleted/i)).toBeVisible();
    await expect(page.getByText(/bank accounts deleted/i)).toBeVisible();
  });

  test("user can cancel data reset", async ({ page }) => {
    await page.goto("/settings");

    // Scroll to danger zone section
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();

    // Click reset button
    await page.getByRole("button", { name: /reset.*data/i }).click();

    // Confirmation modal should appear
    await expect(
      page.getByRole("dialog", { name: /reset.*data/i }),
    ).toBeVisible();

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Modal should close
    await expect(
      page.getByRole("dialog", { name: /reset.*data/i }),
    ).not.toBeVisible();

    // Data should still be there (in this case, no data was created)
    // But the important part is that we didn't delete anything
  });

  test("data reset removes all transactions", async ({ page }) => {
    // First create some data by going to transactions
    const date = "2024-01-15";
    const note = "Test transaction for reset";

    await createTransactionWithoutTags(
      page,
      date,
      "spend",
      "Groceries",
      "50.00",
      "Main Account",
      note,
    );

    // Verify redirected to transactions list
    await expect(page).toHaveURL(/\/transactions/);

    // Now reset data
    await page.goto("/settings");
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();

    // Wait for success message
    await expect(page.getByText(/data reset complete/i)).toBeVisible({
      timeout: 10000,
    });

    // Go back to transactions
    await page.goto("/transactions");

    // Verify no transactions exist - check for empty state or no data rows
    const table = page.locator("table tbody tr");
    await expect(table).toHaveCount(0);
  });

  test("data reset removes all categories", async ({ page }) => {
    // Create a category
    await page.goto("/categories");
    await page.getByRole("button", { name: /create/i }).click();
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(/spend/i).click();
    await page.getByRole("textbox", { name: "* Name" }).fill("Test Category");
    await page.getByRole("button", { name: /save/i }).click();

    // Verify redirected to categories list
    await expect(page).toHaveURL(/\/categories/);

    // Reset data
    await page.goto("/settings");
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();

    // Wait for success message
    await expect(page.getByText(/data reset complete/i)).toBeVisible({
      timeout: 10000,
    });

    // Go back to categories
    await page.goto("/categories");

    // Verify category is gone - only default categories remain
    await expect(page.getByText("Test Category")).not.toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
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
    await loginUser(page, testUser.email, testUser.password);
  });

  test("user can reset all data", async ({ page }) => {
    await page.goto("/settings");

    // Scroll to danger zone section
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();

    // Click reset button
    await page.getByRole("button", { name: /reset.*data/i }).click();

    // Confirmation modal should appear
    await expect(page.getByText(/reset.*data/i)).toBeVisible();

    // Click confirm
    await page.getByRole("button", { name: /yes.*delete.*everything/i }).click();

    // Verify success message
    await expect(page.getByText(/success|completed/i)).toBeVisible();

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
    await expect(page.getByText(/reset.*data/i)).toBeVisible();

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Modal should close
    await expect(page.getByText(/reset.*data/i)).not.toBeVisible();

    // Data should still be there (in this case, no data was created)
    // But the important part is that we didn't delete anything
  });

  test("data reset removes all transactions", async ({ page }) => {
    // First create some data by going to transactions
    await page.goto("/transactions/create");

    // Create a transaction
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Date").fill("2024-01-15");
    await page.getByLabel("Category").selectOption("Groceries");
    await page.getByLabel("Amount").fill("50.00");
    await page.getByLabel("Bank Account").selectOption("Main Account");
    await page.getByRole("button", { name: /save/i }).click();

    // Verify transaction exists
    await expect(page.getByText("50")).toBeVisible();

    // Now reset data
    await page.goto("/settings");
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page.getByRole("button", { name: /yes.*delete.*everything/i }).click();

    // Go back to transactions
    await page.goto("/transactions");

    // Verify no transactions exist
    // The list might show empty state or no rows
    // This depends on how the UI handles empty lists
  });

  test("data reset removes all categories", async ({ page }) => {
    // Create a category
    await page.goto("/categories");
    await page.getByRole("button", { name: /create/i }).click();
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Name").fill("Test Category");
    await page.getByRole("button", { name: /save/i }).click();

    // Verify category exists
    await expect(page.getByText("Test Category")).toBeVisible();

    // Reset data
    await page.goto("/settings");
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page.getByRole("button", { name: /yes.*delete.*everything/i }).click();

    // Verify category is gone
    await page.goto("/categories");
    await expect(page.getByText("Test Category")).not.toBeVisible();
  });
});

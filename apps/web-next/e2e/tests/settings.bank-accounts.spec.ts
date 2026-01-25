import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
} from "../utils/test-helpers";

test.describe("Settings: Bank Accounts", () => {
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

  test("user can create a bank account", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-account-${ts}`;
    const desc = `e2e-bank-account-desc-${ts}`;

    await page.goto("/bank-accounts");

    // Click create button
    await page.getByRole("button", { name: /create/i }).click();

    // Fill form
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(desc);

    // Submit
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to list
    await expect(page).toHaveURL(/\/bank-accounts/);

    // Verify bank account appears in list
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(desc)).toBeVisible();
  });

  test("user can edit a bank account", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-edit-${ts}`;
    const desc = `e2e-bank-desc-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedDesc = `${desc}-updated`;

    // Create bank account
    await page.goto("/bank-accounts/create");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(desc);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/bank-accounts/);

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
    await expect(page).toHaveURL(/\/bank-accounts/);
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(updatedDesc)).toBeVisible();

    // Old values gone
    await expect(page.getByText(name)).not.toBeVisible();
  });

  test("user can delete a bank account", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-delete-${ts}`;

    // Create bank account
    await page.goto("/bank-accounts/create");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/bank-accounts/);

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

  test("user can view bank account details", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-show-${ts}`;

    // Create bank account
    await page.goto("/bank-accounts/create");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill(`description-${ts}`);
    await page.getByRole("button", { name: /save/i }).click();

    // Click show button
    await page.getByRole("button", { name: /show/i }).first().click();

    // Should navigate to show page
    await expect(page).toHaveURL(/\/bank-accounts\/show\//);

    // Verify details shown
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(`description-${ts}`)).toBeVisible();
  });

  test("bank accounts list shows usage count", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-usage-${ts}`;

    // Create bank account
    await page.goto("/bank-accounts/create");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForURL(/\/bank-accounts/);

    // Verify bank account appears with usage count
    await expect(page.getByText(name)).toBeVisible();
    // Usage count should be 0 for new bank account
    await expect(page.getByText("0")).toBeVisible();
  });
});

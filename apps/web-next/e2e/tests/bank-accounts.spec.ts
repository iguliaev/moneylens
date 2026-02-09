import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  createBankAccount,
  cleanupReferenceDataForUser,
  supabaseAdmin,
  waitForFormReady,
} from "../utils/test-helpers";

test.describe("Bank Accounts", () => {
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

    await createBankAccount(page, name, desc);
  });

  test("user can edit a bank account", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-account-edit-${ts}`;
    const desc = `e2e-bank-account-desc-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedDesc = `${desc}-updated`;

    await createBankAccount(page, name, desc);

    // Click edit on the created bank account
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "edit" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Edit Bank Account" }),
    ).toBeVisible();

    // Wait for form to finish loading initial data
    await waitForFormReady(page, "bank-account-edit-form");

    // Update fields
    await page.getByLabel("Name").clear();
    await page.getByLabel("Name").fill(updatedName);
    await page.getByLabel("Description").clear();
    await page.getByLabel("Description").fill(updatedDesc);

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Verify updated
    await expect(page).toHaveURL(/\/bank-accounts/);
    await expect(
      page.getByRole("heading", { name: "Bank Accounts" }),
    ).toBeVisible();

    await expect(
      page.getByRole("cell", { name: updatedName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: updatedDesc, exact: true }),
    ).toBeVisible();

    // Old values gone
    await expect(
      page.getByRole("cell", { name: name, exact: true }),
    ).not.toBeVisible();
  });

  test("user can delete a bank account", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-account-delete-${ts}`;

    await createBankAccount(page, name);

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

  test("user can view bank account details", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-account-show-${ts}`;
    const desc = `e2e-bank-account-desc-${ts}`;

    await createBankAccount(page, name, desc);

    // Click show button
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "eye" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Show Bank Account" }),
    ).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(desc)).toBeVisible();
  });

  test("bank accounts list shows usage count", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-bank-usage-${ts}`;

    await createBankAccount(page, name);

    // Verify bank account appears with usage count
    // TODO: Check usage count when transactions can be linked to bank accounts in e2e tests
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell", { name: "0" })
        .first(),
    ).toBeVisible();
  });
});

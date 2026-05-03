import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  cleanupTransactionsForUser,
} from "../utils/test-helpers";

test.describe("Empty States", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create a fresh test user with NO seeded data
    testUser = await createTestUser();
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  test("Transactions list shows empty state with CTA", async ({ page }) => {
    await page.goto("/transactions");

    // Verify empty state title and description are visible
    await expect(page.getByText("No Transactions Yet")).toBeVisible();
    await expect(
      page.getByText("Start tracking your finances by adding your first transaction.")
    ).toBeVisible();

    // Verify CTA button is visible and clickable
    const addButton = page.getByRole("button", { name: "Add Transaction" });
    await expect(addButton).toBeVisible();

    // Click CTA and verify navigation to create page
    await addButton.click();
    await expect(page).toHaveURL(/\/transactions\/create/);
    await expect(
      page.getByRole("heading", { name: "Create Transaction" })
    ).toBeVisible();
  });

  test("Budgets list shows empty state with CTA", async ({ page }) => {
    await page.goto("/budgets");

    // Verify empty state title and description are visible
    await expect(page.getByText("No Budgets Yet")).toBeVisible();
    await expect(
      page.getByText("Create a budget to track your spending goals and stay on target.")
    ).toBeVisible();

    // Verify CTA button is visible and clickable
    const createButton = page.getByRole("button", { name: "Create Budget" });
    await expect(createButton).toBeVisible();

    // Click CTA and verify navigation to create page
    await createButton.click();
    await expect(page).toHaveURL(/\/budgets\/create/);
    await expect(
      page.getByRole("heading", { name: "Create Budget" })
    ).toBeVisible();
  });

  test("Categories list shows empty state with CTA", async ({ page }) => {
    await page.goto("/categories");

    // Verify empty state title and description are visible
    await expect(page.getByText("No Categories Yet")).toBeVisible();
    await expect(
      page.getByText("Add categories to organize and track your transactions better.")
    ).toBeVisible();

    // Verify CTA button is visible and clickable
    const addButton = page.getByRole("button", { name: "Add Category" });
    await expect(addButton).toBeVisible();

    // Click CTA and verify navigation to create page
    await addButton.click();
    await expect(page).toHaveURL(/\/categories\/create/);
    await expect(
      page.getByRole("heading", { name: "Create Category" })
    ).toBeVisible();
  });

  test("Bank Accounts list shows empty state with CTA", async ({ page }) => {
    await page.goto("/bank-accounts");

    // Verify empty state title and description are visible
    await expect(page.getByText("No Bank Accounts Yet")).toBeVisible();
    await expect(
      page.getByText("Link your bank accounts to start tracking all your transactions in one place.")
    ).toBeVisible();

    // Verify CTA button is visible and clickable
    const addButton = page.getByRole("button", { name: "Add Bank Account" });
    await expect(addButton).toBeVisible();

    // Click CTA and verify navigation to create page
    await addButton.click();
    await expect(page).toHaveURL(/\/bank-accounts\/create/);
    await expect(
      page.getByRole("heading", { name: "Create Bank Account" })
    ).toBeVisible();
  });

  test("Tags list shows empty state with CTA", async ({ page }) => {
    await page.goto("/tags");

    // Verify empty state title and description are visible
    await expect(page.getByText("No Tags Yet")).toBeVisible();
    await expect(
      page.getByText("Create tags to label and filter your transactions by custom attributes.")
    ).toBeVisible();

    // Verify CTA button is visible and clickable
    const addButton = page.getByRole("button", { name: "Add Tag" });
    await expect(addButton).toBeVisible();

    // Click CTA and verify navigation to create page
    await addButton.click();
    await expect(page).toHaveURL(/\/tags\/create/);
    await expect(
      page.getByRole("heading", { name: "Create Tag" })
    ).toBeVisible();
  });
});

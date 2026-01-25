import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  cleanupTransactionsForUser,
  e2eCurrentMonthDate,
} from "../utils/test-helpers";

test.describe("Transactions", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create a single test user and seed reference data once for all tests
    testUser = await createTestUser();
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    // Clean up categories / bank accounts / tags seeded for this user
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    // Ensure each test starts from an authenticated session
    await loginUser(page, testUser.email, testUser.password);
  });

  test.afterEach(async () => {
    // Clean up transactions after each test for isolation
    await cleanupTransactionsForUser(testUser.userId);
  });

  test("user can create spend transaction", async ({ page }) => {
    const date = e2eCurrentMonthDate();
    await page.goto("/transactions/create");

    // Select transaction type
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Spend" }).click();

    // Fill date
    await page.getByLabel("Date").fill(date);

    // Select category (should be filtered to "spend" categories)
    await page.getByLabel("Category").click();
    await page.getByRole("option", { name: "Groceries" }).click();

    // Fill amount
    await page.getByLabel("Amount").fill("50.00");

    // Select bank account
    await page.getByLabel("Bank Account").click();
    await page.getByRole("option", { name: "Main Account" }).click();

    // Submit form
    await page.getByRole("button", { name: /save|create/i }).click();

    // Should redirect to transactions list
    await expect(page).toHaveURL(/\/transactions/);

    // Verify the transaction appears in the list
    await expect(
      page.getByRole("cell", { name: /50\.?00/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /groceries/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /test spend transaction/i }),
    ).not.toBeVisible(); // Notes not shown in list by default
  });

  test("user can create earn transaction", async ({ page }) => {
    const date = e2eCurrentMonthDate();
    await page.goto("/transactions/create");

    // Select transaction type
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Earn" }).click();

    // Fill date
    await page.getByLabel("Date").fill(date);

    // Select category (should be filtered to "earn" categories)
    await page.getByLabel("Category").click();
    await page.getByRole("option", { name: "Salary" }).click();

    // Fill amount
    await page.getByLabel("Amount").fill("1000.00");

    // Select bank account
    await page.getByLabel("Bank Account").click();
    await page.getByRole("option", { name: "Main Account" }).click();

    // Submit form
    await page.getByRole("button", { name: /save|create/i }).click();

    // Should redirect to transactions list
    await expect(page).toHaveURL(/\/transactions/);

    // Verify the transaction appears in the list
    await expect(
      page.getByRole("cell", { name: /1[, ]?000/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /salary/i }),
    ).toBeVisible();
  });

  test("user can create save transaction", async ({ page }) => {
    const date = e2eCurrentMonthDate();
    await page.goto("/transactions/create");

    // Select transaction type
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Save" }).click();

    // Fill date
    await page.getByLabel("Date").fill(date);

    // Select category (should be filtered to "save" categories)
    await page.getByLabel("Category").click();
    await page.getByRole("option", { name: "Savings" }).click();

    // Fill amount
    await page.getByLabel("Amount").fill("200.00");

    // Select bank account
    await page.getByLabel("Bank Account").click();
    await page.getByRole("option", { name: "Main Account" }).click();

    // Submit form
    await page.getByRole("button", { name: /save|create/i }).click();

    // Should redirect to transactions list
    await expect(page).toHaveURL(/\/transactions/);

    // Verify the transaction appears in the list
    await expect(
      page.getByRole("cell", { name: /200/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /savings/i }),
    ).toBeVisible();
  });

  test("user can view transactions list with type filter", async ({ page }) => {
    // Create a spend transaction
    await page.goto("/transactions/create");
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Date").fill(e2eCurrentMonthDate());
    await page.getByLabel("Category").selectOption("Groceries");
    await page.getByLabel("Amount").fill("100.00");
    await page.getByLabel("Bank Account").selectOption("Main Account");
    await page.getByRole("button", { name: /save|create/i }).click();
    await page.waitForURL(/\/transactions/);

    // Should show spend transactions by default (as per list component)
    await expect(
      page.getByRole("cell", { name: /100/i }),
    ).toBeVisible();

    // Filter to earn transactions
    await page.getByRole("tab", { name: /earn/i }).click();

    // Should show earn transactions
    // Note: This might show empty or different data depending on the filter
    // The list component has a default filter for "spend"
  });

  test("user can edit a transaction", async ({ page }) => {
    // First create a transaction
    const date = e2eCurrentMonthDate();
    await page.goto("/transactions/create");
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Date").fill(date);
    await page.getByLabel("Category").selectOption("Groceries");
    await page.getByLabel("Amount").fill("100.00");
    await page.getByLabel("Bank Account").selectOption("Main Account");
    await page.getByRole("button", { name: /save|create/i }).click();
    await page.waitForURL(/\/transactions/);

    // Click edit button on the first row
    await page.getByRole("button", { name: /edit/i }).first().click();

    // Should navigate to edit page
    await expect(page).toHaveURL(/\/transactions\/edit\//);

    // Update the amount
    await page.getByLabel("Amount").clear();
    await page.getByLabel("Amount").fill("150.00");

    // Save changes
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect back to list
    await expect(page).toHaveURL(/\/transactions/);

    // Verify updated amount
    await expect(
      page.getByRole("cell", { name: /150/i }),
    ).toBeVisible();

    // Verify old amount is gone
    await expect(
      page.getByRole("cell", { name: /100/i }),
    ).not.toBeVisible();
  });

  test("user can delete a transaction", async ({ page }) => {
    // First create a transaction
    await page.goto("/transactions/create");
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Date").fill(e2eCurrentMonthDate());
    await page.getByLabel("Category").selectOption("Groceries");
    await page.getByLabel("Amount").fill("75.00");
    await page.getByLabel("Bank Account").selectOption("Main Account");
    await page.getByRole("button", { name: /save|create/i }).click();
    await page.waitForURL(/\/transactions/);

    // Verify transaction appears
    await expect(
      page.getByRole("cell", { name: /75/i }),
    ).toBeVisible();

    // Click delete button on the first row
    // Note: May need to confirm deletion
    await page.getByRole("button", { name: /delete/i }).first().click();

    // Handle confirmation dialog if it appears
    try {
      await page.getByRole("button", { name: /ok|confirm|yes/i }).click();
    } catch {
      // No confirmation dialog, continue
    }

    // Verify transaction is gone
    await expect(
      page.getByRole("cell", { name: /75/i }),
    ).not.toBeVisible();
  });

  test("user can add tags to a transaction", async ({ page }) => {
    await page.goto("/transactions/create");

    // Create transaction with tags
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Date").fill(e2eCurrentMonthDate());
    await page.getByLabel("Category").selectOption("Groceries");
    await page.getByLabel("Amount").fill("50.00");
    await page.getByLabel("Bank Account").selectOption("Main Account");

    // Open tags dropdown (multiple select)
    await page.getByLabel("Tags").click();

    // Select first tag
    await page.getByRole("option", { name: "essentials" }).click();

    // Close dropdown (click elsewhere or press escape)
    await page.keyboard.press("Escape");

    // Submit
    await page.getByRole("button", { name: /save|create/i }).click();

    // Verify transaction appears with tags
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText("essentials")).toBeVisible();
  });

  test("category options change based on transaction type", async ({ page }) => {
    await page.goto("/transactions/create");

    // Select spend type
    await page.getByLabel("Type").selectOption("spend");

    // Open category dropdown
    await page.getByLabel("Category").click();

    // Should show spend categories
    await expect(page.getByRole("option", { name: "Groceries" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Salary" })).not.toBeVisible();

    // Close dropdown
    await page.keyboard.press("Escape");

    // Change to earn type
    await page.getByLabel("Type").selectOption("earn");

    // Open category dropdown again
    await page.getByLabel("Category").click();

    // Should show earn categories
    await expect(page.getByRole("option", { name: "Salary" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Groceries" })).not.toBeVisible();
  });

  test("transaction form validation works", async ({ page }) => {
    await page.goto("/transactions/create");

    // Try to submit without filling required fields
    await page.getByRole("button", { name: /save|create/i }).click();

    // Should show validation errors
    // Ant Design shows errors inline
    await expect(page.getByText(/required|please/i)).toBeVisible();
  });
});

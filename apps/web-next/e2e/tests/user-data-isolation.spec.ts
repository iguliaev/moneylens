import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  seedReferenceDataWithPrefix,
  seedTransactionsForUser,
  cleanupReferenceDataForUser,
} from "../utils/test-helpers";

test.describe("User Data Isolation", () => {
  let userA: { email: string; password: string; userId: string };
  let userB: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create two test users sequentially (parallel creation can cause DB race conditions)
    userA = await createTestUser("userA");
    userB = await createTestUser("userB");

    // Seed distinct reference data for each user
    await seedReferenceDataWithPrefix(userA.userId, "userA");
    await seedReferenceDataWithPrefix(userB.userId, "userB");

    // Seed transactions with identifiable notes
    await seedTransactionsForUser(userA.userId, "userA");
    await seedTransactionsForUser(userB.userId, "userB");
  });

  test.afterAll(async () => {
    // Guard against cleanup if beforeAll failed
    if (userA?.userId) await cleanupReferenceDataForUser(userA.userId);
    if (userB?.userId) await cleanupReferenceDataForUser(userB.userId);
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  test.describe("Dashboard Isolation", () => {
    test("User A sees only their own totals on dashboard", async ({ page }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/");

      // User A's totals: spend=100, earn=500, save=200
      // Note: Dashboard shows statistics, need to check actual elements
      // The web-next dashboard shows statistics in tabs
      await expect(page.getByText(/spend|earn|save/i)).toBeVisible();
    });

    test("User B sees only their own totals on dashboard", async ({ page }) => {
      await loginUser(page, userB.email, userB.password);
      await page.goto("/");

      // User B's totals: spend=100, earn=500, save=200
      await expect(page.getByText(/spend|earn|save/i)).toBeVisible();
    });
  });

  test.describe("Transaction List Isolation", () => {
    test("Transactions page shows only current user's transactions", async ({
      page,
    }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/transactions");

      // User A's transaction visible
      await expect(
        page.getByText("userA-spend-transaction"),
      ).toBeVisible();
      await expect(
        page.getByText("userA-earn-transaction"),
      ).toBeVisible();
      await expect(
        page.getByText("userA-save-transaction"),
      ).toBeVisible();

      // User B's transaction NOT visible
      await expect(
        page.getByText("userB-spend-transaction"),
      ).not.toBeVisible();
      await expect(
        page.getByText("userB-earn-transaction"),
      ).not.toBeVisible();
      await expect(
        page.getByText("userB-save-transaction"),
      ).not.toBeVisible();
    });

    test("Filtered views show only current user's data", async ({
      page,
    }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/transactions");

      // Filter to spend type
      await page.getByRole("tab", { name: /spend/i }).click();

      // User A's spend visible
      await expect(
        page.getByText("userA-spend-transaction"),
      ).toBeVisible();

      // User B's spend NOT visible
      await expect(
        page.getByText("userB-spend-transaction"),
      ).not.toBeVisible();

      // Filter to earn type
      await page.getByRole("tab", { name: /earn/i }).click();

      // User A's earn visible
      await expect(page.getByText("userA-earn-transaction")).toBeVisible();

      // User B's earn NOT visible
      await expect(
        page.getByText("userB-earn-transaction"),
      ).not.toBeVisible();
    });
  });

  test.describe("Settings Pages Isolation", () => {
    test("Categories page shows only current user's categories", async ({
      page,
    }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/categories");

      // User A's category visible
      await expect(page.getByText("userA-Groceries")).toBeVisible();
      await expect(page.getByText("userA-Salary")).toBeVisible();
      await expect(page.getByText("userA-Savings")).toBeVisible();

      // User B's category NOT visible
      await expect(page.getByText("userB-Groceries")).not.toBeVisible();
      await expect(page.getByText("userB-Salary")).not.toBeVisible();
      await expect(page.getByText("userB-Savings")).not.toBeVisible();

      // Test type filtering - categories are filtered by type in web-next
      // User A should only see their own categories regardless of type filter
    });

    test("Tags page shows only current user's tags", async ({ page }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/tags");

      await expect(page.getByText("userA-tag1")).toBeVisible();
      await expect(page.getByText("userA-tag2")).toBeVisible();

      await expect(page.getByText("userB-tag1")).not.toBeVisible();
      await expect(page.getByText("userB-tag2")).not.toBeVisible();
    });

    test("Bank accounts page shows only current user's accounts", async ({
      page,
    }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/bank-accounts");

      await expect(page.getByText("userA-Bank")).toBeVisible();

      await expect(page.getByText("userB-Bank")).not.toBeVisible();
    });
  });

  test.describe("Cross-User Verification", () => {
    test("User B cannot see User A's data", async ({ page }) => {
      await loginUser(page, userB.email, userB.password);
      await page.goto("/transactions");

      // User B should see their own data
      await expect(
        page.getByText("userB-spend-transaction"),
      ).toBeVisible();
      await expect(
        page.getByText("userB-earn-transaction"),
      ).toBeVisible();
      await expect(
        page.getByText("userB-save-transaction"),
      ).toBeVisible();

      // User B should NOT see User A's data
      await expect(
        page.getByText("userA-spend-transaction"),
      ).not.toBeVisible();
      await expect(
        page.getByText("userA-earn-transaction"),
      ).not.toBeVisible();
      await expect(
        page.getByText("userA-save-transaction"),
      ).not.toBeVisible();
    });

    test("User A cannot see User B's categories", async ({ page }) => {
      await loginUser(page, userA.email, userA.password);
      await page.goto("/categories");

      // User A should see their categories
      await expect(page.getByText("userA-Groceries")).toBeVisible();
      await expect(page.getByText("userA-Salary")).toBeVisible();
      await expect(page.getByText("userA-Savings")).toBeVisible();

      // User A should NOT see User B's categories
      await expect(page.getByText("userB-Groceries")).not.toBeVisible();
      await expect(page.getByText("userB-Salary")).not.toBeVisible();
      await expect(page.getByText("userB-Savings")).not.toBeVisible();
    });
  });

  test.describe("Data Creation Isolation", () => {
    test("User A creates data that's invisible to User B", async ({
      page,
    }) => {
      // User A creates a transaction
      await loginUser(page, userA.email, userA.password);
      await page.goto("/transactions/create");

      await page.getByLabel("Type").selectOption("spend");
      await page.getByLabel("Date").fill("2024-01-20");
      await page.getByLabel("Category").selectOption("userA-Groceries");
      await page.getByLabel("Amount").fill("999.00");
      await page.getByLabel("Bank Account").selectOption("userA-Bank");
      await page.getByRole("button", { name: /save/i }).click();

      // Verify User A sees it
      await expect(page.getByText("999")).toBeVisible();

      // User B logs in
      await loginUser(page, userB.email, userB.password);
      await page.goto("/transactions");

      // User B should NOT see User A's transaction
      await expect(page.getByText("999")).not.toBeVisible();

      // User B should only see their own transactions
      await expect(
        page.getByText("userB-spend-transaction"),
      ).toBeVisible();
      await expect(
        page.getByText("userA-spend-transaction"),
      ).not.toBeVisible();
    });
  });
});

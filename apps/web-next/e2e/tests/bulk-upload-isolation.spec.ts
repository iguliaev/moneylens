import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  logoutUser,
  e2eCurrentMonthDate,
} from "../utils/test-helpers";
import * as path from "path";
import * as fs from "fs";
import { Buffer } from "buffer";

test.describe("Bulk Upload Data Isolation", () => {
  let userA: { email: string; password: string; userId: string };
  let userB: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create two test users sequentially (parallel creation can cause DB race conditions)
    userA = await createTestUser("userA");
    userB = await createTestUser("userB");
  });

  test.afterAll(async () => {
    // Guard against cleanup if beforeAll failed
    if (userA?.userId) await cleanupReferenceDataForUser(userA.userId);
    if (userB?.userId) await cleanupReferenceDataForUser(userB.userId);
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  test("data uploaded by User A is not visible to User B", async ({ page }) => {
    // User A uploads data
    await loginUser(page, userA.email, userA.password);
    await page.goto("/settings");

    const date = e2eCurrentMonthDate();
    const fixturePath = path.join(__dirname, "../fixtures/valid-bulk-upload.json");
    const fixtureJson = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (Array.isArray(fixtureJson.transactions)) {
      fixtureJson.transactions = fixtureJson.transactions.map((t: any) => ({
        ...t,
        date,
      }));
    }
    const buffer = Buffer.from(JSON.stringify(fixtureJson), "utf8");

    // Upload file
    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "valid-bulk-upload.json",
        mimeType: "application/json",
        buffer,
      });

    // Verify preview and submit
    await expect(page.getByText(/preview|upload/i)).toBeVisible();
    await page.getByRole("button", { name: /upload/i }).click();
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify User A can see the uploaded data
    await page.goto("/categories");
    await expect(page.getByText("e2e-spend-cat")).toBeVisible();
    await expect(page.getByText("e2e-earn-cat")).toBeVisible();

    await page.goto("/transactions");
    await expect(page.getByText("E2E spend transaction")).toBeVisible();
    await expect(page.getByText("E2E earn transaction")).toBeVisible();

    // Logout User A
    await logoutUser(page);

    // Now login as User B
    await loginUser(page, userB.email, userB.password);

    // Verify User B cannot see User A's uploaded categories
    await page.goto("/categories");
    await expect(page.getByText("e2e-spend-cat")).not.toBeVisible();
    await expect(page.getByText("e2e-earn-cat")).not.toBeVisible();

    // User B should only see their own default categories (if any)
    // or an empty list
  });

  test("User B's bulk upload doesn't affect User A's data", async ({ page }) => {
    // First, User A uploads some data
    await loginUser(page, userA.email, userA.password);
    await page.goto("/settings");

    const date = e2eCurrentMonthDate();
    const fixturePath = path.join(__dirname, "../fixtures/valid-bulk-upload.json");
    const fixtureJson = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (Array.isArray(fixtureJson.transactions)) {
      fixtureJson.transactions = fixtureJson.transactions.map((t: any) => ({
        ...t,
        date,
      }));
    }
    const buffer = Buffer.from(JSON.stringify(fixtureJson), "utf8");

    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "valid-bulk-upload.json",
        mimeType: "application/json",
        buffer,
      });
    await page.getByRole("button", { name: /upload/i }).click();
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify User A's data
    await page.goto("/transactions");
    await expect(page.getByText("E2E spend transaction")).toBeVisible();

    // Logout User A
    await logoutUser(page);

    // User B uploads different data
    await loginUser(page, userB.email, userB.password);
    await page.goto("/settings");

    const userBFixture = {
      categories: [
        { type: "spend", name: "UserB-Spend", description: "UserB spend" },
      ],
      transactions: [
        {
          date,
          type: "spend",
          amount: 500.0,
          category: "UserB-Spend",
          notes: "UserB transaction",
        },
      ],
    };

    const userBBuffer = Buffer.from(JSON.stringify(userBFixture), "utf8");

    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "userB-data.json",
        mimeType: "application/json",
        buffer,
      });
    await page.getByRole("button", { name: /upload/i }).click();
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify User B's data
    await page.goto("/transactions");
    await expect(page.getByText("UserB transaction")).toBeVisible();

    // Logout User B
    await logoutUser(page);

    // Login as User A again
    await loginUser(page, userA.email, userA.password);

    // Verify User A's data is still intact
    await page.goto("/transactions");
    await expect(page.getByText("E2E spend transaction")).toBeVisible();

    // User A should NOT see User B's transaction
    await expect(page.getByText("UserB transaction")).not.toBeVisible();

    // User A should NOT see User B's category
    await page.goto("/categories");
    await expect(page.getByText("UserB-Spend")).not.toBeVisible();
  });

  test("bulk upload respects row-level security", async ({ page }) => {
    // User A uploads data with identifiable markers
    await loginUser(page, userA.email, userA.password);
    await page.goto("/settings");

    const date = e2eCurrentMonthDate();
    const userAFixture = {
      transactions: [
        {
          date,
          type: "spend",
          amount: 999.0,
          category: "Groceries",
          notes: "ISOLATION_TEST_USER_A",
        },
      ],
    };

    const buffer = Buffer.from(JSON.stringify(userAFixture), "utf8");

    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "userA-isolation.json",
        mimeType: "application/json",
        buffer,
      });
    await page.getByRole("button", { name: /upload/i }).click();
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // User B logs in and tries to upload with User A's markers
    await logoutUser(page);
    await loginUser(page, userB.email, userB.password);
    await page.goto("/settings");

    const userBFixture = {
      transactions: [
        {
          date,
          type: "spend",
          amount: 888.0,
          category: "Groceries",
          notes: "ISOLATION_TEST_USER_B",
        },
      ],
    };

    const userBBuffer = Buffer.from(JSON.stringify(userBFixture), "utf8");

    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "userB-isolation.json",
        mimeType: "application/json",
        buffer,
      });
    await page.getByRole("button", { name: /upload/i }).click();
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify User B sees their own data
    await page.goto("/transactions");
    await expect(page.getByText("ISOLATION_TEST_USER_B")).toBeVisible();
    await expect(page.getByText("888")).toBeVisible();

    // User B should NOT see User A's transaction
    await expect(page.getByText("ISOLATION_TEST_USER_A")).not.toBeVisible();
    await expect(page.getByText("999")).not.toBeVisible();
  });
});

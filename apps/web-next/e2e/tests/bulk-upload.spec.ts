import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  e2eCurrentMonthDate,
} from "../utils/test-helpers";
import * as path from "path";
import * as fs from "fs";
import { Buffer } from "buffer";

test.describe("Bulk Upload", () => {
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

  test("user can bulk upload valid JSON with all entity types", async ({
    page,
  }) => {
    await page.goto("/settings");

    const date = e2eCurrentMonthDate();
    const fixturePath = path.join(__dirname, "../fixtures/valid-bulk-upload.json");
    const fixtureJson = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    // Update dates in fixture to current month
    if (Array.isArray(fixtureJson.transactions)) {
      fixtureJson.transactions = fixtureJson.transactions.map((t: any) => ({
        ...t,
        date,
      }));
    }
    const buffer = Buffer.from(JSON.stringify(fixtureJson), "utf8");

    // Upload valid JSON file
    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "valid-bulk-upload.json",
        mimeType: "application/json",
        buffer,
      });

    // Verify preview appears
    await expect(page.getByText(/preview|upload/i)).toBeVisible();

    // Click upload button
    await page.getByRole("button", { name: /upload/i }).click();

    // Verify success message
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify counts
    await expect(page.getByText(/categories/i)).toBeVisible();
    await expect(page.getByText(/bank accounts/i)).toBeVisible();
    await expect(page.getByText(/tags/i)).toBeVisible();
    await expect(page.getByText(/transactions/i)).toBeVisible();

    // Navigate to categories and verify
    await page.goto("/categories");
    await expect(page.getByText("e2e-spend-cat")).toBeVisible();
    await expect(page.getByText("e2e-earn-cat")).toBeVisible();
    await expect(page.getByText("e2e-save-cat")).toBeVisible();

    // Navigate to bank accounts and verify
    await page.goto("/bank-accounts");
    await expect(page.getByText("e2e-bank-account")).toBeVisible();

    // Navigate to tags and verify
    await page.goto("/tags");
    await expect(page.getByText("e2e-tag-1")).toBeVisible();
    await expect(page.getByText("e2e-tag-2")).toBeVisible();

    // Navigate to transactions and verify
    await page.goto("/transactions");
    await expect(page.getByText("E2E spend transaction")).toBeVisible();
    await expect(page.getByText("E2E earn transaction")).toBeVisible();
    await expect(page.getByText("E2E save transaction")).toBeVisible();
  });

  test("user sees error for invalid JSON syntax", async ({ page }) => {
    await page.goto("/settings");

    const filePath = path.join(__dirname, "../fixtures/invalid-json.json");

    // Upload invalid JSON file
    await page.locator("input[type='file']").setInputFiles(filePath);

    // File error should appear
    await expect(page.getByText(/error|invalid|failed/i)).toBeVisible();

    // Upload button should be disabled or error shown
    await expect(
      page.getByRole("button", { name: /upload/i }),
    ).toBeDisabled();
  });

  test("user sees error for invalid category type", async ({ page }) => {
    await page.goto("/settings");

    const filePath = path.join(
      __dirname,
      "../fixtures/invalid-category-type.json",
    );

    // Upload file with invalid category type
    await page.locator("input[type='file']").setInputFiles(filePath);

    // Preview should appear (JSON is valid, data is not)
    await expect(page.getByText(/preview/i)).toBeVisible();

    // Click upload
    await page.getByRole("button", { name: /upload/i }).click();

    // Error should appear
    await expect(page.getByText(/error|invalid/i)).toBeVisible();

    // No success message
    await expect(page.getByText(/success|completed/i)).not.toBeVisible();
  });

  test("user can upload transactions only", async ({ page }) => {
    await page.goto("/settings");

    // Create a simple transactions-only JSON
    const date = e2eCurrentMonthDate();
    const transactionsJson = {
      transactions: [
        {
          date,
          type: "spend",
          amount: 100.0,
          category: "Groceries",
          notes: "Test bulk upload transaction",
        },
      ],
    };

    const buffer = Buffer.from(JSON.stringify(transactionsJson), "utf8");

    // Upload file
    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "transactions-only.json",
        mimeType: "application/json",
        buffer,
      });

    // Click upload
    await page.getByRole("button", { name: /upload/i }).click();

    // Verify success
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify transactions were created
    await page.goto("/transactions");
    await expect(
      page.getByText("Test bulk upload transaction"),
    ).toBeVisible();
  });

  test("user can upload categories, tags, and bank accounts", async ({
    page,
  }) => {
    await page.goto("/settings");

    const json = {
      categories: [
        { type: "spend", name: "Bulk Category", description: "Test" },
      ],
      bank_accounts: [{ name: "Bulk Bank", description: "Test" }],
      tags: [{ name: "Bulk Tag", description: "Test" }],
    };

    const buffer = Buffer.from(JSON.stringify(json), "utf8");

    // Upload file
    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "reference-data.json",
        mimeType: "application/json",
        buffer,
      });

    // Click upload
    await page.getByRole("button", { name: /upload/i }).click();

    // Verify success
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify each resource
    await page.goto("/categories");
    await expect(page.getByText("Bulk Category")).toBeVisible();

    await page.goto("/bank-accounts");
    await expect(page.getByText("Bulk Bank")).toBeVisible();

    await page.goto("/tags");
    await expect(page.getByText("Bulk Tag")).toBeVisible();
  });

  test("file size validation works", async ({ page }) => {
    await page.goto("/settings");

    // Create a large JSON file (> 1MB)
    const largeJson = {
      transactions: Array.from({ length: 50000 }, (_, i) => ({
        date: "2024-01-01",
        type: "spend",
        amount: i,
        category: "Test",
        notes: `Transaction ${i}`,
      })),
    };

    const buffer = Buffer.from(JSON.stringify(largeJson), "utf8");

    // Try to upload
    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "too-large.json",
        mimeType: "application/json",
        buffer,
      });

    // Should show file size error
    await expect(page.getByText(/large|size/i)).toBeVisible();
  });

  test("file type validation works", async ({ page }) => {
    await page.goto("/settings");

    // Create a text file
    const buffer = Buffer.from("This is not a JSON file", "utf8");

    // Try to upload
    await page
      .locator("input[type='file']")
      .setInputFiles({
        name: "not-json.txt",
        mimeType: "text/plain",
        buffer,
      });

    // Should show file type error
    await expect(page.getByText(/json/i)).toBeVisible();
  });
});

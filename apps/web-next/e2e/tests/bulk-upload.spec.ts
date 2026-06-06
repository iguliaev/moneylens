import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  supabaseAdmin,
} from "../utils/test-helpers";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  test("uploads valid JSON and verifies data is present in the system", async ({
    page,
  }) => {
    // Reset all data first
    await page.goto("/settings");

    // Click on Danger Zone tab
    await page.getByRole("tab", { name: /danger zone/i }).click();

    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();
    const successAlert = page
      .getByRole("tabpanel", { name: /danger zone/i })
      .getByRole("alert")
      .filter({ hasText: /data reset complete/i });
    await expect(successAlert).toBeVisible();

    // Go back to settings and switch to Import & Export tab to upload
    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    // Upload valid bulk upload file
    const fixturePath = path.join(
      __dirname,
      "../fixtures/valid-bulk-upload.json"
    );
    await page.locator("input[type='file']").setInputFiles(fixturePath);

    // Verify preview appears
    await expect(page.getByText(/Preview:.*3 categories/i)).toBeVisible();
    await expect(page.getByText(/1 bank accounts/i)).toBeVisible();
    await expect(page.getByText(/2 tags/i)).toBeVisible();
    await expect(page.getByText(/3 transactions/i)).toBeVisible();

    // Click upload button
    await page.getByRole("button", { name: /^upload$/i, exact: true }).click();

    // Verify success alert appears
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: new RegExp("Upload Successful", "i") })
    ).toBeVisible();

    // Verify counts are shown in success message
    await expect(page.getByText(/3 categories inserted/i)).toBeVisible();
    await expect(page.getByText(/1 bank accounts inserted/i)).toBeVisible();
    await expect(page.getByText(/2 tags inserted/i)).toBeVisible();
    await expect(page.getByText(/3 transactions inserted/i)).toBeVisible();

    // Verify data exists in database
    const { data: categories, error: catError } = await supabaseAdmin
      .from("categories")
      .select("name")
      .eq("user_id", testUser.userId);

    expect(catError).toBeNull();
    expect(categories).toHaveLength(3);
    expect(categories?.map((c) => c.name)).toContain("e2e-spend-cat");
    expect(categories?.map((c) => c.name)).toContain("e2e-earn-cat");
    expect(categories?.map((c) => c.name)).toContain("e2e-save-cat");

    const { data: bankAccounts, error: bankError } = await supabaseAdmin
      .from("bank_accounts")
      .select("name")
      .eq("user_id", testUser.userId);

    expect(bankError).toBeNull();
    expect(bankAccounts).toHaveLength(1);
    expect(bankAccounts?.[0].name).toBe("e2e-bank-account");

    const { data: tags, error: tagsError } = await supabaseAdmin
      .from("tags")
      .select("name")
      .eq("user_id", testUser.userId);

    expect(tagsError).toBeNull();
    expect(tags).toHaveLength(2);

    const { data: transactions, error: txError } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("user_id", testUser.userId);

    expect(txError).toBeNull();
    expect(transactions).toHaveLength(3);
  });

  test("shows error when uploading invalid JSON syntax", async ({ page }) => {
    // Reset all data first
    await page.goto("/settings");

    // Click on Danger Zone tab
    await page.getByRole("tab", { name: /danger zone/i }).click();

    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();
    const successAlert = page
      .getByRole("tabpanel", { name: /danger zone/i })
      .getByRole("alert")
      .filter({ hasText: /data reset complete/i });
    await expect(successAlert).toBeVisible();

    // Go to Import & Export tab
    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    // Try to upload invalid JSON file
    const fixturePath = path.join(__dirname, "../fixtures/invalid-json.json");
    await page.locator("input[type='file']").setInputFiles(fixturePath);

    // Error message should appear
    await expect(
      page.getByRole("alert").filter({ hasText: new RegExp("error", "i") })
    ).toBeVisible();

    // Upload button should be disabled
    await expect(
      page.getByRole("button", { name: /^upload$/i, exact: true })
    ).toBeDisabled();
  });

  test("shows error when uploading invalid category type", async ({ page }) => {
    await page.goto("/settings");

    // Click on Import & Export tab
    await page.getByRole("tab", { name: /import.*export/i }).click();

    // Try to upload file with invalid category type
    const fixturePath = path.join(
      __dirname,
      "../fixtures/invalid-category-type.json"
    );
    await page.locator("input[type='file']").setInputFiles(fixturePath);

    // Preview should appear (JSON is syntactically valid)
    await expect(page.getByText(/Preview:.*1 categories/i)).toBeVisible();

    // Click upload button
    await page.getByRole("button", { name: /^upload$/i, exact: true }).click();

    // Error alert should appear
    await expect(
      page.getByRole("alert").filter({ hasText: new RegExp("error", "i") })
    ).toBeVisible();

    // Success alert should not appear
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: new RegExp("Upload Successful", "i") })
    ).not.toBeVisible();
  });

  test("bulk upload rejects transaction rows referencing parent categories", async ({
    page,
  }) => {
    const ts = Date.now();
    const parentName = `e2e-parent-cat-${ts}`;
    const childName = `e2e-child-cat-${ts}`;

    // Seed parent + child via admin so parent becomes non-leaf
    const { data: parent } = await supabaseAdmin
      .from("categories")
      .insert({ user_id: testUser.userId, type: "spend", name: parentName })
      .select("id")
      .single();

    await supabaseAdmin.from("categories").insert({
      user_id: testUser.userId,
      type: "spend",
      name: childName,
      parent_id: parent!.id,
    });

    // Upload fixture referencing the parent category name
    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    // Build a temp fixture file via page.evaluate (blob URL trick) is not ideal;
    // instead use setInputFiles with a buffer constructed from the fixture template
    const fixtureContent = JSON.stringify({
      transactions: [
        {
          date: "2025-12-20",
          type: "spend",
          category: parentName,
          amount: 20.0,
          notes: "should fail - parent category",
        },
      ],
    });

    await page.locator("input[type='file']").setInputFiles({
      name: "parent-category-upload.json",
      mimeType: "application/json",
      buffer: Buffer.from(fixtureContent),
    });

    // Preview should show 1 transaction
    await expect(page.getByText(/Preview:.*1 transactions/i)).toBeVisible();

    // Click upload
    await page.getByRole("button", { name: /^upload$/i, exact: true }).click();

    // Error alert should appear (parent category rejected)
    await expect(
      page.getByRole("alert").filter({ hasText: /error/i })
    ).toBeVisible();

    // No transactions should have been inserted
    const { data: txns } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("user_id", testUser.userId);

    expect(txns).toHaveLength(0);
  });
});

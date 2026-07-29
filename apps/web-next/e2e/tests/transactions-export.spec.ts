import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs/promises";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  supabaseAdmin,
} from "../utils/test-helpers";

async function fillExportDateRange(
  page: Page,
  startDate: string,
  endDate: string
) {
  const startInput = page.getByRole("textbox", { name: "Start date" });
  await startInput.click();
  await startInput.pressSequentially(startDate, { delay: 20 });
  await startInput.press("Enter");

  const endInput = page.getByRole("textbox", { name: "End date" });
  await endInput.pressSequentially(endDate, { delay: 20 });
  await endInput.press("Enter");
}

test.describe("Transactions CSV Export", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser("export");
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  test("exports transactions in range as CSV with hierarchical category, bank account, and sorted tags", async ({
    page,
  }) => {
    const now = new Date().toISOString();
    const userId = testUser.userId;

    const { data: parentCategory, error: parentError } = await supabaseAdmin
      .from("categories")
      .insert({
        user_id: userId,
        type: "spend",
        name: "Food",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (parentError || !parentCategory)
      throw new Error(`Failed to seed parent category: ${parentError?.message}`);

    const { data: childCategory, error: childError } = await supabaseAdmin
      .from("categories")
      .insert({
        user_id: userId,
        type: "spend",
        name: "Eating out",
        parent_id: parentCategory.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (childError || !childCategory)
      throw new Error(`Failed to seed child category: ${childError?.message}`);

    const { data: bankAccount, error: bankAccountError } = await supabaseAdmin
      .from("bank_accounts")
      .insert({
        user_id: userId,
        name: "Chase Checking",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (bankAccountError || !bankAccount)
      throw new Error(`Failed to seed bank account: ${bankAccountError?.message}`);

    const { data: tags, error: tagsError } = await supabaseAdmin
      .from("tags")
      .insert([
        { user_id: userId, name: "urgent", created_at: now, updated_at: now },
        {
          user_id: userId,
          name: "groceries",
          created_at: now,
          updated_at: now,
        },
      ])
      .select("id, name");
    if (tagsError || !tags)
      throw new Error(`Failed to seed tags: ${tagsError?.message}`);

    const transactionDate = "2026-03-15";
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: userId,
        date: transactionDate,
        type: "spend",
        category_id: childCategory.id,
        bank_account_id: bankAccount.id,
        amount: 42.5,
        notes: "Export test transaction",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (transactionError || !transaction)
      throw new Error(
        `Failed to seed transaction: ${transactionError?.message}`
      );

    const { error: transactionTagsError } = await supabaseAdmin
      .from("transaction_tags")
      .insert(
        tags.map((tag) => ({
          transaction_id: transaction.id,
          tag_id: tag.id,
        }))
      );
    if (transactionTagsError)
      throw new Error(
        `Failed to associate tags: ${transactionTagsError.message}`
      );

    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    await fillExportDateRange(page, "01/03/2026", "31/03/2026");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export csv/i }).click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Download did not produce a file");
    const content = await fs.readFile(downloadPath, "utf-8");

    expect(content).toContain(
      "Date,Type,Category,Bank Account,Amount,Tags,Notes"
    );
    expect(content).toContain(transactionDate);
    expect(content).toContain("Food/Eating out");
    expect(content).toContain("Chase Checking");
    expect(content).toContain("groceries;urgent");
    expect(content).toContain("Export test transaction");
  });

  test("exports transactions in range as JSON with hierarchical category path and a real tags array", async ({
    page,
  }) => {
    const now = new Date().toISOString();
    const userId = testUser.userId;

    const { data: parentCategory, error: parentError } = await supabaseAdmin
      .from("categories")
      .insert({
        user_id: userId,
        type: "spend",
        name: "Transport",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (parentError || !parentCategory)
      throw new Error(`Failed to seed parent category: ${parentError?.message}`);

    const { data: childCategory, error: childError } = await supabaseAdmin
      .from("categories")
      .insert({
        user_id: userId,
        type: "spend",
        name: "Taxi",
        parent_id: parentCategory.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (childError || !childCategory)
      throw new Error(`Failed to seed child category: ${childError?.message}`);

    const { data: tags, error: tagsError } = await supabaseAdmin
      .from("tags")
      .insert([
        { user_id: userId, name: "json-urgent", created_at: now, updated_at: now },
        {
          user_id: userId,
          name: "json-groceries",
          created_at: now,
          updated_at: now,
        },
      ])
      .select("id, name");
    if (tagsError || !tags)
      throw new Error(`Failed to seed tags: ${tagsError?.message}`);

    const transactionDate = "2026-04-20";
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: userId,
        date: transactionDate,
        type: "spend",
        category_id: childCategory.id,
        amount: 18.75,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (transactionError || !transaction)
      throw new Error(
        `Failed to seed transaction: ${transactionError?.message}`
      );

    const { error: transactionTagsError } = await supabaseAdmin
      .from("transaction_tags")
      .insert(
        tags.map((tag) => ({
          transaction_id: transaction.id,
          tag_id: tag.id,
        }))
      );
    if (transactionTagsError)
      throw new Error(
        `Failed to associate tags: ${transactionTagsError.message}`
      );

    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    await page.getByText("JSON", { exact: true }).click();
    await fillExportDateRange(page, "01/04/2026", "30/04/2026");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export json/i }).click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Download did not produce a file");
    const content = await fs.readFile(downloadPath, "utf-8");

    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed.transactions)).toBe(true);
    const row = parsed.transactions.find(
      (tx: { date: string }) => tx.date === transactionDate
    );
    expect(row).toBeDefined();
    expect(row.category).toBe("Transport/Taxi");
    expect(Array.isArray(row.tags)).toBe(true);
    expect([...row.tags].sort()).toEqual(["json-groceries", "json-urgent"]);
    expect(row).not.toHaveProperty("bank_account");
  });

  test("blocks export and shows an error when the date range exceeds the row cap", async ({
    page,
  }) => {
    await page.route(/\/rest\/v1\/transactions_with_details/, async (route) => {
      const request = route.request();
      if (request.method() === "HEAD") {
        await route.fulfill({
          status: 206,
          headers: {
            "content-range": "*/10001",
            "access-control-expose-headers": "content-range",
          },
          body: "",
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    await fillExportDateRange(page, "01/01/2020", "31/12/2030");

    await page.getByRole("button", { name: /export csv/i }).click();

    await expect(
      page.getByText(/exceeds the 10,000-row export limit/i).first()
    ).toBeVisible();
  });
});

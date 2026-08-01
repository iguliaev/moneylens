import { test, expect, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  selectFromVisibleAntdDropdown,
  supabaseAdmin,
} from "../utils/test-helpers";

/**
 * The whole antd Select for a given accessible name. The combobox role sits on
 * the inner search input, whose immediate parent holds no text — the rendered
 * selection lives further up, in the `.ant-select` shell.
 */
function selectShell(page: Page, comboboxName: string) {
  return page
    .getByRole("combobox", { name: comboboxName })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', @class, ' '), ' ant-select ')][1]"
    );
}

async function openTransactionsSettingsTab(page: Page) {
  await page.goto("/settings");
  await page.getByRole("tab", { name: /^transactions$/i }).click();
  await expect(
    page.getByRole("combobox", { name: "Default transaction type" })
  ).toBeVisible();
  // The grid renders before its category/bank-account options resolve; opening a
  // Select mid-load yields an empty dropdown.
  await expect(page.locator(".ant-spin-blur")).toHaveCount(0);
}

test.describe("Transaction Defaults", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser("txn-defaults");
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await supabaseAdmin
      .from("user_transaction_defaults")
      .delete()
      .eq("user_id", testUser.userId);
    await supabaseAdmin
      .from("user_settings")
      .update({ default_transaction_type: null })
      .eq("user_id", testUser.userId);
    await loginUser(page, testUser.email, testUser.password);
  });

  test("settings page exposes a Transactions tab with a row per type", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(page.getByRole("tab")).toHaveCount(4);

    await page.getByRole("tab", { name: /^transactions$/i }).click();

    for (const label of ["Earn", "Spend", "Save"]) {
      await expect(
        page.getByRole("combobox", { name: `Default category for ${label}` })
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", {
          name: `Default bank account for ${label}`,
        })
      ).toBeVisible();
    }
  });

  test("category options are scoped to their row's transaction type", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);

    // Seeded data has exactly one category per type: Groceries/spend,
    // Salary/earn, Savings/save. The spend row must not offer the earn one.
    await page
      .getByRole("combobox", { name: "Default category for Spend" })
      .click({ force: true });

    const dropdown = page.locator(".ant-select-dropdown:visible");
    await expect(dropdown.getByTitle(/^Groceries$/i)).toBeVisible();
    await expect(dropdown.getByTitle(/^Salary$/i)).toHaveCount(0);
  });

  test("defaults persist across a reload", async ({ page }) => {
    await openTransactionsSettingsTab(page);

    await selectFromVisibleAntdDropdown(
      page,
      "Default transaction type",
      "Spend"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default category for Spend",
      "Groceries"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default bank account for Spend",
      "Main Account"
    );

    // Each Select writes through on change, so there is no Save button to
    // await. Reloading is the honest check that the value actually reached the
    // database rather than only local state.
    await page.reload();
    await page.getByRole("tab", { name: /^transactions$/i }).click();

    await expect(selectShell(page, "Default transaction type")).toContainText(
      "Spend"
    );
    await expect(selectShell(page, "Default category for Spend")).toContainText(
      "Groceries"
    );
    await expect(
      selectShell(page, "Default bank account for Spend")
    ).toContainText("Main Account");
  });

  test("a default can be cleared again", async ({ page }) => {
    await openTransactionsSettingsTab(page);

    await selectFromVisibleAntdDropdown(
      page,
      "Default category for Earn",
      "Salary"
    );

    const shell = selectShell(page, "Default category for Earn");
    await shell.hover();
    await shell.locator(".ant-select-clear").click({ force: true });

    await page.reload();
    await page.getByRole("tab", { name: /^transactions$/i }).click();
    await expect(
      selectShell(page, "Default category for Earn")
    ).not.toContainText("Salary");
  });

  test("create form pre-fills date, type, category and bank account", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await selectFromVisibleAntdDropdown(
      page,
      "Default transaction type",
      "Spend"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default category for Spend",
      "Groceries"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default bank account for Spend",
      "Main Account"
    );

    // Reached directly, with no ?type= — the sidebar/kbar entry point, which is
    // the case the stored default type exists to cover.
    await page.goto("/transactions/create");

    // DATE_PICKER_INPUT_FORMATS puts DD/MM/YYYY first, so that is what renders.
    const today = new Date();
    const expectedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
      today.getMonth() + 1
    ).padStart(2, "0")}/${today.getFullYear()}`;
    await expect(page.getByLabel("Date")).toHaveValue(expectedDate);

    await expect(selectShell(page, "* Type")).toContainText(/spend/i);
    await expect(selectShell(page, "* Category")).toContainText("Groceries");
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Main Account"
    );
  });

  test("changing type on the create form swaps in that type's defaults", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await selectFromVisibleAntdDropdown(
      page,
      "Default category for Spend",
      "Groceries"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default bank account for Spend",
      "Main Account"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default category for Earn",
      "Salary"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default bank account for Earn",
      "Secondary Account"
    );

    await page.goto("/transactions/create");

    await selectFromVisibleAntdDropdown(page, "* Type", "Spend");
    await expect(selectShell(page, "* Category")).toContainText("Groceries");
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Main Account"
    );

    await selectFromVisibleAntdDropdown(page, "* Type", "Earn");
    await expect(selectShell(page, "* Category")).toContainText("Salary");
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Secondary Account"
    );
  });

  test("a manually chosen bank account is not overwritten by the default", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await selectFromVisibleAntdDropdown(
      page,
      "Default transaction type",
      "Spend"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default bank account for Spend",
      "Main Account"
    );

    await page.goto("/transactions/create");
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Main Account"
    );

    await selectFromVisibleAntdDropdown(
      page,
      "* Bank Account",
      "Secondary Account"
    );
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Secondary Account"
    );
  });

  test("a soft-deleted default is ignored rather than shown as a raw id", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await selectFromVisibleAntdDropdown(
      page,
      "Default transaction type",
      "Spend"
    );
    await selectFromVisibleAntdDropdown(
      page,
      "Default category for Spend",
      "Groceries"
    );

    // The FK is ON DELETE SET NULL, which never fires for a soft delete — the
    // defaults row keeps pointing at a category the UI no longer lists.
    await supabaseAdmin
      .from("categories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", testUser.userId)
      .eq("name", "Groceries");

    await page.goto("/transactions/create");

    const category = selectShell(page, "* Category");
    await expect(category).not.toContainText("Groceries");
    await expect(category).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}/i);

    // Restore for the remaining tests in the file
    await supabaseAdmin
      .from("categories")
      .update({ deleted_at: null })
      .eq("user_id", testUser.userId)
      .eq("name", "Groceries");
  });
});

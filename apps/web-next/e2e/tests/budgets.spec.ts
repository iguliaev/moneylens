import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  createBudget,
  createTag,
  e2eCurrentMonthDate,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  waitForFormReady,
  supabaseAdmin,
} from "../utils/test-helpers";

test.describe("Budgets", () => {
  let testUser: { email: string; password: string; userId: string } | undefined;

  test.beforeAll(async () => {
    testUser = await createTestUser();
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    if (!testUser) return;
    await supabaseAdmin.from("budgets").delete().eq("user_id", testUser.userId);
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    if (!testUser) throw new Error("Budgets test user was not initialized");
    await loginUser(page, testUser.email, testUser.password);
  });

  test("user can create a budget", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-create-${ts}`;
    const desc = `vacation budget ${ts}`;

    await createBudget(page, name, "Spend", "1000", desc);
  });

  test("user can create a budget with dates", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-create-dates-${ts}`;
    const startDate = e2eCurrentMonthDate(10);
    const endDate = e2eCurrentMonthDate(20);

    await createBudget(page, name, "Spend", "1200", undefined, startDate, endDate);
  });

  test("user can edit a budget", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-edit-${ts}`;
    const updatedName = `${name}-updated`;
    const updatedAmount = "2000";

    await createBudget(page, name, "Save", "500");

    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "edit" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Edit Budget" })
    ).toBeVisible();
    await waitForFormReady(page, "budget-edit-form");

    await page.getByRole("textbox", { name: "* Name" }).clear();
    await page.getByRole("textbox", { name: "* Name" }).fill(updatedName);

    await page.getByRole("spinbutton", { name: "* Target Amount" }).clear();
    await page
      .getByRole("spinbutton", { name: "* Target Amount" })
      .fill(updatedAmount);

    await page.getByRole("button", { name: /save/i }).click();

    await expect(page).toHaveURL(/\/budgets/);
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: updatedName, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: name, exact: true })
    ).not.toBeVisible();
  });

  test("user can delete a budget", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-delete-${ts}`;

    await createBudget(page, name, "Earn", "3000");

    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "delete" })
      .click();

    await expect(page.getByText("Are you sure?")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(
      page.getByRole("cell", { name: name, exact: true })
    ).not.toBeVisible();
  });

  test("user can view budget details", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-show-${ts}`;
    const desc = `show desc ${ts}`;

    await createBudget(page, name, "Spend", "750", desc);

    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "eye" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Show Budget" })
    ).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(desc)).toBeVisible();
  });

  test("budget list shows category and tag counts", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-counts-${ts}`;

    await createBudget(page, name, "Spend", "500");

    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell", { name: "0" })
        .first()
    ).toBeVisible();
  });

  test("user can create a budget with categories and tags and counts update in list", async ({
    page,
  }) => {
    const ts = Date.now();
    const name = `e2e-budget-with-links-${ts}`;

    await page.goto("/budgets");
    await page.getByRole("button", { name: /create/i }).click();
    await expect(
      page.getByRole("heading", { name: "Create Budget" })
    ).toBeVisible();

    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(/^Spend$/i).click();

    await page.getByRole("spinbutton", { name: "* Target Amount" }).fill("800");

    // Select the seeded "Groceries" spend category
    await page.getByRole("combobox", { name: "Categories" }).click();
    await page
      .getByTitle(/Groceries/i)
      .first()
      .click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/budgets/);
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();

    // Category count for this budget should be 1
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell", { name: "1" })
        .first()
    ).toBeVisible();
  });

  test("user can edit a budget's categories and tags", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-edit-links-${ts}`;
    const tagA = `e2e-tag-a-${ts}`;
    const tagB = `e2e-tag-b-${ts}`;

    await createTag(page, tagA);
    await createTag(page, tagB);

    // Create a budget linked to the "Groceries" category and tagA
    await page.goto("/budgets");
    await page.getByRole("button", { name: /create/i }).click();
    await expect(
      page.getByRole("heading", { name: "Create Budget" })
    ).toBeVisible();

    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(/^Spend$/i).click();
    await page.getByRole("spinbutton", { name: "* Target Amount" }).fill("800");

    await page.getByRole("combobox", { name: "Categories" }).click();
    await page
      .getByTitle(/Groceries/i)
      .first()
      .click();
    await page.keyboard.press("Escape");

    await page.getByRole("combobox", { name: "Tags" }).click();
    await page.getByTitle(tagA, { exact: true }).first().click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/budgets/);
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();

    // Category count for this budget should be 1
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell", { name: "1" })
        .first()
    ).toBeVisible();

    // Edit: keep the existing category/tagA link and add tagB alongside it
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "edit" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Edit Budget" })
    ).toBeVisible();
    await waitForFormReady(page, "budget-edit-form");

    // Prior links should be pre-populated
    await expect(page.getByTitle(/Groceries/i).first()).toBeVisible();
    await expect(page.getByTitle(tagA, { exact: true }).first()).toBeVisible();

    await page.getByRole("combobox", { name: "Tags" }).click();
    await page.getByTitle(tagB, { exact: true }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/budgets/);
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();

    // Tag count for this budget should now be 2 (tagA + tagB), category
    // count unchanged at 1
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("cell", { name: "2" })
        .first()
    ).toBeVisible();

    // Re-open edit to verify the addition persisted through the RPC
    // round-trip (proves the edit form's prefill -> resubmit -> replace-links
    // path in update_budget_with_links, not just the create path)
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "edit" })
      .click();
    await waitForFormReady(page, "budget-edit-form");

    await expect(page.getByTitle(tagA, { exact: true }).first()).toBeVisible();
    await expect(page.getByTitle(tagB, { exact: true }).first()).toBeVisible();
  });

  test("dashboard shows budgets section with progress bars", async ({
    page,
  }) => {
    const ts = Date.now();
    const name = `e2e-dashboard-budget-${ts}`;

    // Create a budget
    await createBudget(page, name, "Spend", "500");

    // Go to dashboard
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    // Budget section should be visible
    await expect(
      page.getByRole("main").getByText("Budgets", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: name })).toBeVisible();

    // Progress bar should be rendered (Ant Design renders it as a role="progressbar")
    await expect(page.getByRole("progressbar").first()).toBeVisible();
  });

  test("inactive budgets stay on the list but leave the dashboard, and the switch toggles it", async ({
    page,
  }) => {
    const ts = Date.now();
    const name = `e2e-active-toggle-${ts}`;
    await createBudget(page, name, "Spend", "300");

    // New budgets are active by default, so it shows on the dashboard.
    await page.goto("/");
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Turn it off from the budgets list.
    await page.goto("/budgets");
    const toggle = page.getByRole("switch", {
      name: `Show ${name} on dashboard`,
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    // Still listed on the budgets page after a reload...
    await page.reload();
    await expect(
      page.getByRole("switch", { name: `Show ${name} on dashboard` })
    ).not.toBeChecked();

    // ...but gone from the dashboard.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name })).toHaveCount(0);

    // Turn it back on: it returns to the dashboard.
    await page.goto("/budgets");
    await page
      .getByRole("switch", { name: `Show ${name} on dashboard` })
      .click();
    await expect(
      page.getByRole("switch", { name: `Show ${name} on dashboard` })
    ).toBeChecked();
    await page.goto("/");
    await expect(page.getByRole("heading", { name })).toBeVisible();
  });

  test("a budget can be created inactive from the form", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-create-inactive-${ts}`;

    await page.goto("/budgets/create");
    await expect(
      page.getByRole("heading", { name: "Create Budget" })
    ).toBeVisible();
    await page.getByRole("textbox", { name: "* Name" }).fill(name);
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(/^Spend$/i).click();
    await page.getByRole("spinbutton", { name: "* Target Amount" }).fill("50");
    const dashboardSwitch = page.getByRole("switch", {
      name: "Show on dashboard",
    });
    await expect(dashboardSwitch).toBeChecked();
    await dashboardSwitch.click();
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page).toHaveURL(/\/budgets(\?.*)?$/);
    await expect(
      page.getByRole("switch", { name: `Show ${name} on dashboard` })
    ).not.toBeChecked();
    await page.goto("/");
    await expect(page.getByRole("heading", { name })).toHaveCount(0);
  });
});

test.describe("Budget dashboard ordering", () => {
  // Own user: createBudget looks for the new budget on the first page of the
  // list, so it must not share a user that already has more than a page of them.
  let testUser: { email: string; password: string; userId: string } | undefined;

  test.beforeAll(async () => {
    testUser = await createTestUser();
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    if (!testUser) return;
    await supabaseAdmin.from("budgets").delete().eq("user_id", testUser.userId);
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    if (!testUser) throw new Error("Ordering test user was not initialized");
    await loginUser(page, testUser.email, testUser.password);
  });

  test("dashboard lists budgets by name, not by creation order", async ({
    page,
  }) => {
    const ts = Date.now();
    const nameB = `e2e-sort-b-${ts}`;
    const nameA = `e2e-sort-a-${ts}`;
    // Created B first, then A: creation order would put B before A.
    await createBudget(page, nameB, "Spend", "100");
    await createBudget(page, nameA, "Spend", "100");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: nameA })).toBeVisible();
    const titles = await page
      .getByRole("heading", { level: 5 })
      .allTextContents();
    expect(titles.indexOf(nameA)).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf(nameA)).toBeLessThan(titles.indexOf(nameB));
  });
});

test.describe("Budget alert states", () => {
  let testUser: { email: string; password: string; userId: string } | undefined;

  test.beforeAll(async () => {
    testUser = await createTestUser();
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    if (!testUser) return;
    await supabaseAdmin
      .from("transactions")
      .delete()
      .eq("user_id", testUser.userId);
    await supabaseAdmin.from("budgets").delete().eq("user_id", testUser.userId);
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    if (!testUser)
      throw new Error("Budget alert test user was not initialized");
    await loginUser(page, testUser.email, testUser.password);
  });

  async function seedBudgetAtPercent(userId: string, percent: number) {
    const now = new Date().toISOString();
    const ts = Date.now();
    const targetAmount = 100;
    const transactionAmount = percent;

    // Insert a spend budget
    const { data: budgetData, error: budgetError } = await supabaseAdmin
      .from("budgets")
      .insert({
        user_id: userId,
        name: `e2e-alert-budget-${percent}-${ts}`,
        type: "spend",
        target_amount: targetAmount,
        created_at: now,
        updated_at: now,
      })
      .select("id, name")
      .single();
    if (budgetError)
      throw new Error(`Budget insert failed: ${budgetError.message}`);

    // Get the seeded Groceries (spend) category
    const { data: catData, error: catError } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "spend")
      .eq("name", "Groceries")
      .single();
    if (catError) throw new Error(`Category fetch failed: ${catError.message}`);

    // Link the category to the budget
    const { error: linkError } = await supabaseAdmin
      .from("budget_categories")
      .insert({ budget_id: budgetData.id, category_id: catData.id });
    if (linkError)
      throw new Error(`Budget-category link failed: ${linkError.message}`);

    // Insert a transaction that pushes the budget to the target percent
    const { error: txError } = await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      date: new Date().toISOString().split("T")[0],
      type: "spend",
      amount: transactionAmount,
      category_id: catData.id,
      notes: `e2e-alert-txn-${percent}-${ts}`,
      created_at: now,
      updated_at: now,
    });
    if (txError)
      throw new Error(`Transaction insert failed: ${txError.message}`);

    return budgetData.name;
  }

  test("spend budget at 85% shows Near limit tag in list", async ({ page }) => {
    if (!testUser)
      throw new Error("Budget alert test user was not initialized");
    const budgetName = await seedBudgetAtPercent(testUser.userId, 85);

    await page.goto("/budgets");
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: budgetName });
    await expect(row).toBeVisible();
    await expect(row.getByText("⚠ Near limit")).toBeVisible();
  });

  test("spend budget at 100% shows Over budget tag in list", async ({
    page,
  }) => {
    if (!testUser)
      throw new Error("Budget alert test user was not initialized");
    const budgetName = await seedBudgetAtPercent(testUser.userId, 100);

    await page.goto("/budgets");
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: budgetName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Over budget")).toBeVisible();
  });

  test("spend budget at 100% shows Over budget tag on dashboard", async ({
    page,
  }) => {
    if (!testUser)
      throw new Error("Budget alert test user was not initialized");
    const budgetName = await seedBudgetAtPercent(testUser.userId, 100);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    // Use .ant-card as the boundary so we scope to a single budget card
    // and avoid matching ancestor divs that contain multiple cards.
    const card = page
      .getByRole("main")
      .locator(".ant-card")
      .filter({ hasText: budgetName });
    await expect(card.getByText("Over budget").first()).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  createBudget,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  waitForFormReady,
  supabaseAdmin,
} from "../utils/test-helpers";

test.describe("Budgets", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser();
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from("budgets").delete().eq("user_id", testUser.userId);
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  test("user can create a budget", async ({ page }) => {
    const ts = Date.now();
    const name = `e2e-budget-create-${ts}`;
    const desc = `vacation budget ${ts}`;

    await createBudget(page, name, "Spend", "1000", desc);
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
});

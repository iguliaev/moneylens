import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
} from "../utils/test-helpers";

test.describe("Settings Tabs", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser();
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  test("settings page displays three tabs", async ({ page }) => {
    await page.goto("/settings");

    // Verify all three tabs are visible
    const generalTab = page.getByRole("tab", { name: /^general$/i });
    const importExportTab = page.getByRole("tab", { name: /import.*export/i });
    const dangerZoneTab = page.getByRole("tab", { name: /danger zone/i });

    await expect(generalTab).toBeVisible();
    await expect(importExportTab).toBeVisible();
    await expect(dangerZoneTab).toBeVisible();
  });

  test("general tab shows currency settings", async ({ page }) => {
    await page.goto("/settings");

    // General tab should be active by default
    const generalTab = page.getByRole("tab", { name: /^general$/i });
    await expect(generalTab).toHaveAttribute("aria-selected", "true");

    // Should see currency section
    await expect(page.getByText(/choose the currency/i)).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("import and export tab shows bulk upload section", async ({ page }) => {
    await page.goto("/settings");

    // Click on Import & Export tab
    const importExportTab = page.getByRole("tab", { name: /import.*export/i });
    await importExportTab.click();

    // Tab should be active
    await expect(importExportTab).toHaveAttribute("aria-selected", "true");

    // Should see bulk upload section
    await expect(page.getByText(/bulk upload/i)).toBeVisible();
    await expect(page.getByText(/upload a json file/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /select json file/i })).toBeVisible();
  });

  test("danger zone tab shows reset data section", async ({ page }) => {
    await page.goto("/settings");

    // Click on Danger Zone tab
    const dangerZoneTab = page.getByRole("tab", { name: /danger zone/i });
    await dangerZoneTab.click();

    // Tab should be active
    await expect(dangerZoneTab).toHaveAttribute("aria-selected", "true");

    // Should see danger zone section
    await expect(page.getByText(/permanently delete all your data/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /reset.*all.*data/i })).toBeVisible();
  });

  test("can switch between tabs", async ({ page }) => {
    await page.goto("/settings");

    // Start at General
    const generalTab = page.getByRole("tab", { name: /^general$/i });
    await expect(generalTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/choose the currency/i)).toBeVisible();

    // Switch to Import & Export
    const importExportTab = page.getByRole("tab", { name: /import.*export/i });
    await importExportTab.click();
    await expect(importExportTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/bulk upload/i)).toBeVisible();
    await expect(page.getByText(/choose the currency/i)).not.toBeVisible();

    // Switch to Danger Zone
    const dangerZoneTab = page.getByRole("tab", { name: /danger zone/i });
    await dangerZoneTab.click();
    await expect(dangerZoneTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/permanently delete all your data/i)).toBeVisible();
    await expect(page.getByText(/choose the currency/i)).not.toBeVisible();

    // Switch back to General
    await generalTab.click();
    await expect(generalTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/choose the currency/i)).toBeVisible();
  });

  test("danger zone tab requires deliberate navigation", async ({ page }) => {
    await page.goto("/settings");

    // By default, user starts at General tab (not Danger Zone)
    const generalTab = page.getByRole("tab", { name: /^general$/i });
    await expect(generalTab).toHaveAttribute("aria-selected", "true");

    // Reset button should not be visible on the General tab
    const resetButton = page.getByRole("button", { name: /reset.*all.*data/i });
    await expect(resetButton).not.toBeVisible();

    // Reset button should only be visible after explicitly clicking Danger Zone tab
    const dangerZoneTab = page.getByRole("tab", { name: /danger zone/i });
    await dangerZoneTab.click();
    await expect(resetButton).toBeVisible();
  });
});

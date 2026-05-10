import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
} from "../utils/test-helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Settings RPC resilience", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser("settings-rpc-resilience");
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, testUser.email, testUser.password);
  });

  test("bulk upload shows RPC failure details", async ({ page }) => {
    await page.route("**/rest/v1/rpc/bulk_upload_data", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          code: "P0001",
          message: "Simulated bulk upload RPC failure",
          details: null,
          hint: null,
        }),
      });
    });

    await page.goto("/settings");
    await page.getByRole("tab", { name: /import.*export/i }).click();

    const fixturePath = path.join(__dirname, "../fixtures/valid-bulk-upload.json");
    await page.locator("input[type='file']").setInputFiles(fixturePath);
    await page.getByRole("button", { name: /^upload$/i, exact: true }).click();

    await expect(page.getByRole("alert").filter({ hasText: /error/i })).toBeVisible();
    await expect(page.getByText(/simulated bulk upload rpc failure/i)).toBeVisible();
  });

  test("data reset closes modal and shows RPC failure", async ({ page }) => {
    await page.route("**/rest/v1/rpc/reset_user_data", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          code: "P0001",
          message: "Simulated reset RPC failure",
          details: null,
          hint: null,
        }),
      });
    });

    await page.goto("/settings");
    await page.getByRole("tab", { name: /danger zone/i }).click();
    await page.getByRole("button", { name: /reset.*data/i }).click();
    await page
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();

    await expect(page.getByRole("dialog", { name: /reset all data/i })).not.toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /error/i })).toBeVisible();
    await expect(page.getByText(/simulated reset rpc failure/i)).toBeVisible();
  });
});

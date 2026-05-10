import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
} from "../utils/test-helpers";

test.describe("Dashboard", () => {
  test("charts tab renders key analytics sections", async ({ page }) => {
    const { email, password, userId } = await createTestUser("dashboard");

    try {
      await loginUser(page, email, password);

      await page.getByRole("tab", { name: /charts/i }).click();

      await expect(page.getByRole("combobox", { name: "From year" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "From month" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "To year" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "To month" })).toBeVisible();

      await expect(
        page.getByRole("heading", { name: "Income vs Spending vs Savings" })
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Spending Trendline" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "By Tag" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "🏷️ Spending by tag" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "🏷️ Earnings by tag" })).toBeVisible();
      await expect(
        page.getByText("End month must not be before start month")
      ).not.toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });
});

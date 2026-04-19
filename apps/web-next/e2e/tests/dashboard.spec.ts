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

      await expect(
        page.getByText("Income vs Spending vs Savings")
      ).toBeVisible();
      await expect(page.getByText("Spending Trendline")).toBeVisible();
      await expect(page.getByRole("heading", { name: "By Tag" })).toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });
});

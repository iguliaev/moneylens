import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

test.describe("Dashboard month range validation", () => {
  test("charts tab blocks invalid month range and shows warning", async ({ page }) => {
    const { email, password, userId } = await createTestUser("dashboard-month-range");

    try {
      await loginUser(page, email, password);
      await page.getByRole("tab", { name: /charts/i }).click();

      const currentYear = String(new Date().getFullYear());

      await page.getByRole("combobox", { name: "From year" }).click();
      await page.getByTitle(currentYear).click();
      await page.getByRole("combobox", { name: "To year" }).click();
      await page.getByTitle(currentYear).click();

      await page.getByRole("combobox", { name: "From month" }).click();
      await page.getByTitle("December").click();
      await page.getByRole("combobox", { name: "To month" }).click();
      await page.getByTitle("January").click();

      await expect(
        page.getByText("End month must be after start month")
      ).toBeVisible();
      await expect(
        page.getByText("Income vs Spending vs Savings")
      ).not.toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });
});

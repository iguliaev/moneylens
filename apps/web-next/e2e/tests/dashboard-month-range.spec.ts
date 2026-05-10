import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

const chartDataEndpointPattern =
  /\/rest\/v1\/(view_monthly_totals|view_monthly_category_totals|view_monthly_tagged_type_totals)\b/i;

test.describe("Dashboard month range validation", () => {
  test("charts tab allows single-month range", async ({ page }) => {
    const { email, password, userId } = await createTestUser("dashboard-month-range");

    try {
      await loginUser(page, email, password);
      await page.getByRole("tab", { name: /charts/i }).click();

      const currentYear = await page.evaluate(() =>
        String(new Date().getFullYear())
      );

      await page.getByRole("combobox", { name: "From year" }).click();
      await page.getByTitle(currentYear).click();
      await page.getByRole("combobox", { name: "To year" }).click();
      await page.getByTitle(currentYear).click();

      await page.getByRole("combobox", { name: "From month" }).click();
      await page.getByTitle("January").click();
      await page.getByRole("combobox", { name: "To month" }).click();
      await page.getByTitle("January").click();

      await expect(
        page.getByText("End month must not be before start month")
      ).not.toBeVisible();
      await expect(page.getByText("Income vs Spending vs Savings")).toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("charts tab blocks invalid month range and shows warning", async ({ page }) => {
    const { email, password, userId } = await createTestUser("dashboard-month-range");

    try {
      await loginUser(page, email, password);

      let chartRequestCount = 0;
      page.on("request", (request) => {
        if (chartDataEndpointPattern.test(request.url())) {
          chartRequestCount += 1;
        }
      });

      await page.getByRole("tab", { name: /charts/i }).click();
      await page.waitForLoadState("networkidle");

      const currentYear = await page.evaluate(() =>
        String(new Date().getFullYear())
      );

      await page.getByRole("combobox", { name: "From year" }).click();
      await page.getByTitle(currentYear).click();
      await page.getByRole("combobox", { name: "To year" }).click();
      await page.getByTitle(currentYear).click();

      await page.getByRole("combobox", { name: "From month" }).click();
      await page.getByTitle("December").click();
      await page.getByRole("combobox", { name: "To month" }).click();
      await page.getByTitle("January").click();

      await expect(
        page.getByText("End month must not be before start month")
      ).toBeVisible();
      await expect(
        page.getByText("Income vs Spending vs Savings")
      ).not.toBeVisible();

      // Capture baseline after invalid range is active; no new chart requests should be made from this state.
      const chartRequestCountAtInvalidRange = chartRequestCount;
      await expect
        .poll(() => chartRequestCount, {
          message: "invalid chart range should suppress chart data network requests",
          timeout: 2000,
        })
        .toBe(chartRequestCountAtInvalidRange);
    } finally {
      await deleteTestUser(userId);
    }
  });
});

import { expect, test, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  waitForChartsTabReady,
} from "../utils/test-helpers";

const chartDataEndpointPattern =
  /\/rest\/v1\/(view_monthly_totals|view_monthly_category_totals|view_monthly_tagged_type_totals)\b/i;

const openMonthRangeSelect = async (label: string, page: Page) => {
  await page.getByRole("combobox", { name: label }).click({ force: true });
};

const selectMonthRangeByKey = async (
  label: string,
  key: "Home" | "End",
  page: Page
) => {
  await openMonthRangeSelect(label, page);
  await page.keyboard.press(key);
  await page.keyboard.press("Enter");
};

test.describe("Dashboard month range validation", () => {
  test("charts tab allows single-month range", async ({ page }) => {
    const { email, password, userId } = await createTestUser(
      "dashboard-month-range"
    );

    try {
      await loginUser(page, email, password);
      await page.getByRole("tab", { name: /charts/i }).click();

      await selectMonthRangeByKey("From month", "Home", page);
      await selectMonthRangeByKey("To month", "Home", page);

      await expect(
        page.getByText("End month must not be before start month")
      ).not.toBeVisible();
      await expect(
        page.getByText("Income vs Spending vs Savings")
      ).toBeVisible();
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("charts tab blocks invalid month range and shows warning", async ({
    page,
  }) => {
    const { email, password, userId } = await createTestUser(
      "dashboard-month-range"
    );

    try {
      await loginUser(page, email, password);

      let chartRequestCount = 0;
      page.on("request", (request) => {
        if (chartDataEndpointPattern.test(request.url())) {
          chartRequestCount += 1;
        }
      });

      await page.getByRole("tab", { name: /charts/i }).click();
      await waitForChartsTabReady(page);

      await openMonthRangeSelect("To year", page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

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
          message:
            "invalid chart range should suppress chart data network requests",
          timeout: 2000,
        })
        .toBe(chartRequestCountAtInvalidRange);
    } finally {
      await deleteTestUser(userId);
    }
  });
});

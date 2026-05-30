import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
} from "../utils/test-helpers";

const scenarios = [
  {
    mode: "light",
    bodyColor: "rgb(245, 247, 251)",
  },
  {
    mode: "dark",
    bodyColor: "rgb(15, 23, 42)",
  },
] as const;

test.describe("Theme tokens", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser("theme-tokens");
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.userId);
  });

  for (const scenario of scenarios) {
    test(`apply the ${scenario.mode} theme on the login page`, async ({
      page,
    }) => {
      await page.addInitScript((mode) => {
        window.localStorage.setItem("colorMode", mode);
      }, scenario.mode);

      await page.goto("/login");

      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        scenario.mode
      );
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        scenario.bodyColor
      );
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
        "content",
        scenario.bodyColor === "rgb(245, 247, 251)" ? "#f5f7fb" : "#0f172a"
      );
    });

    test(`apply tokenized danger colors on settings in ${scenario.mode} mode`, async ({
      page,
    }) => {
      await page.addInitScript((mode) => {
        window.localStorage.setItem("colorMode", mode);
      }, scenario.mode);

      await loginUser(page, testUser.email, testUser.password);
      await page.goto("/settings");
      await page.getByRole("tab", { name: /danger zone/i }).click();

      const dangerIcon = page
        .locator(".ant-card")
        .filter({ hasText: /permanently delete all your data/i })
        .locator(".anticon-delete");
      await expect(dangerIcon).toHaveCSS(
        "color",
        scenario.mode === "light" ? "rgb(207, 19, 34)" : "rgb(253, 164, 175)"
      );
    });
  }
});

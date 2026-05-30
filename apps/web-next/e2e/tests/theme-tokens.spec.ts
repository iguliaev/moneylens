import { expect, test } from "@playwright/test";

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
  }
});


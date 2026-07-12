import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

test.describe("Content width shell", () => {
  test("selected authenticated pages use the shared width shell", async ({
    page,
  }) => {
    const { email, password, userId } = await createTestUser();

    try {
      await loginUser(page, email, password);

      for (const path of [
        "/transactions",
        "/categories",
        "/budgets",
        "/tags",
        "/settings",
      ]) {
        await page.goto(path);

        const shell = page.getByTestId("page-width-shell");
        await expect(shell).toBeVisible();
        await expect(shell).toHaveCSS("max-width", "1200px");
      }
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("login page does not use the shared width shell", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByTestId("page-width-shell")).toHaveCount(0);
  });
});

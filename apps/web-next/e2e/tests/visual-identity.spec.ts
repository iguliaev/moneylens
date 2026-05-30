import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, loginUser } from "../utils/test-helpers";

test.describe("Quiet Ledger branding", () => {
  let user: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    user = await createTestUser();
  });

  test.afterAll(async () => {
    await deleteTestUser(user.userId);
  });

  test("shows the icon + wordmark and the color mode toggle in the app shell", async ({
    page,
  }) => {
    await loginUser(page, user.email, user.password);
    await page.goto("/");

    await expect(page.getByText("MoneyLens", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /toggle color mode/i })
    ).toBeVisible();
  });

  test("renders the Quiet Ledger auth page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("MoneyLens", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});

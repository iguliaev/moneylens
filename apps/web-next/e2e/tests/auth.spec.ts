import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
} from "../utils/test-helpers";

test.describe("Authentication", () => {
  test("user can login with email/password", async ({ page }) => {
    const { email, password, userId } = await createTestUser();

    try {
      await loginUser(page, email, password);
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("user can logout", async ({ page }) => {
    const { email, password, userId } = await createTestUser();

    try {
      await loginUser(page, email, password);

      await page.getByText("Logout").click();

      // Verify successful logout by checking redirect to login page
      await expect(page).toHaveURL("/login", { timeout: 5000 });
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("user can register a new account", async ({ page }) => {
    test.skip(!!process.env.CI, "Sign‑up test only runs locally");

    const email = `new-user-${Date.now()}@example.com`;
    const password = "TestPassword123!";

    await page.goto("/register");

    // Sign up
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // Verify successful registration by checking for redirect to dashboard
    await expect(page).toHaveURL("/", { timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    // Check the user exists in the database
    const { supabaseAdmin } = await import("../utils/test-helpers");
    const { data } = await supabaseAdmin.auth.admin.listUsers();
    const user = (data as any).users?.find((u: any) => u.email === email);

    expect(user).toBeDefined();

    await (await import("../utils/test-helpers")).deleteTestUser(user.id);
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    // Try to access protected route
    await page.goto("/transactions");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("authenticated user can access protected routes", async ({ page }) => {
    const { email, password, userId } = await createTestUser();

    try {
      await loginUser(page, email, password);

      // Access protected routes
      await page.goto("/transactions");
      await expect(page).toHaveURL("/transactions");

      await page.goto("/tags");
      await expect(page).toHaveURL("/tags");

      await page.goto("/categories");
      await expect(page).toHaveURL("/categories");

      await page.goto("/bank-accounts");
      await expect(page).toHaveURL("/bank-accounts");

      await page.goto("/settings");
      await expect(page).toHaveURL("/settings");
    } finally {
      await deleteTestUser(userId);
    }
  });
});

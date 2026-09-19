import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  supabaseAdmin,
} from "../utils/test-helpers";

const NEW_PASSWORD = "NewPassword456!";

const isLocalOrigin = (baseURL: string | undefined) => {
  if (!baseURL) return false;
  const { hostname } = new URL(baseURL);
  return hostname === "localhost" || hostname === "127.0.0.1";
};

// Builds the same link the "Reset Password" email button carries
// ({{ .ConfirmationURL }}), without needing a mail server.
async function generateRecoveryLink(email: string, baseURL: string) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${baseURL}/update-password` },
  });
  if (error || !data?.properties?.action_link) {
    throw error ?? new Error("generateLink returned no action_link");
  }
  return data.properties.action_link;
}

test.describe("Password reset", () => {
  // Hosted staging only allow-lists the stable git-main URL as a redirect
  // target, so per-deployment preview URLs can't complete this flow.
  test.skip(
    ({ baseURL }) => !isLocalOrigin(baseURL),
    "Recovery redirect is only allow-listed for local and stable staging URLs",
  );

  test("user can set a new password from a recovery link", async ({
    page,
    baseURL,
  }) => {
    const { email, password, userId } = await createTestUser("reset");

    try {
      const link = await generateRecoveryLink(email, baseURL!);

      await page.goto(link);

      // The link must land on the update-password form, not bounce elsewhere
      await expect(page).toHaveURL(/\/update-password/);
      await page.getByLabel("New Password", { exact: true }).fill(NEW_PASSWORD);
      await page.getByLabel("Confirm New Password").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Update" }).click();

      await expect(page).toHaveURL("/");
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();

      // The old password no longer works; the new one does
      await page.getByText("Logout").click();
      await expect(page).toHaveURL("/login");

      const { error: oldPasswordError } =
        await supabaseAdmin.auth.signInWithPassword({ email, password });
      expect(oldPasswordError).not.toBeNull();

      await loginUser(page, email, NEW_PASSWORD);
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("a recovery link that was already used does not sign anyone in", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { email, userId } = await createTestUser("reset-reuse");

    try {
      const link = await generateRecoveryLink(email, baseURL!);

      // First use consumes the one-time token
      await page.goto(link);
      await expect(page).toHaveURL(/\/update-password/);

      // Second use, from a fresh browser with no session, must not authenticate
      const freshContext = await browser.newContext({ baseURL });
      try {
        const freshPage = await freshContext.newPage();
        await freshPage.goto(link);
        await freshPage.goto("/");
        await expect(freshPage).toHaveURL(/\/login/);
      } finally {
        await freshContext.close();
      }
    } finally {
      await deleteTestUser(userId);
    }
  });
});

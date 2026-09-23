import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  supabaseAdmin,
} from "../utils/test-helpers";

const NEW_PASSWORD = "NewPassword456!";

// The only app origin whose /update-password is in the local Supabase
// redirect allow-list (supabase/config.toml).
const ALLOW_LISTED_ORIGIN = "http://localhost:5173";

const hostnameOf = (url: string | undefined) => {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return undefined;
  }
};

// What decides whether the redirect works is the Supabase project's
// allow-list, not just where the app runs: CI can serve the app locally while
// pointing at hosted staging Supabase, which doesn't allow-list our origin.
const canRunResetFlow = (baseURL: string | undefined) =>
  baseURL !== undefined &&
  new URL(baseURL).origin === ALLOW_LISTED_ORIGIN &&
  ["localhost", "127.0.0.1"].includes(
    hostnameOf(process.env.VITE_SUPABASE_URL) ?? "",
  );

// Throwaway client for password probes: signing in on the shared service-role
// client would make it act as that user for every later call in the worker.
const anonClient = () =>
  createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_KEY!,
    { auth: { persistSession: false } },
  );

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
  // Hosted projects only allow-list their stable URL as a redirect target, so
  // this flow can only be completed against local Supabase with the app on
  // the allow-listed origin.
  test.skip(
    ({ baseURL }) => !canRunResetFlow(baseURL),
    `Needs local Supabase and the app at ${ALLOW_LISTED_ORIGIN}`,
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
        await anonClient().auth.signInWithPassword({ email, password });
      expect(oldPasswordError).not.toBeNull();

      await loginUser(page, email, NEW_PASSWORD);
    } finally {
      await deleteTestUser(userId);
    }
  });

  test("a recovery link that was already used is rejected and signs no one in", async ({
    page,
    request,
    baseURL,
  }) => {
    const { email, userId } = await createTestUser("reset-reuse");

    try {
      const link = await generateRecoveryLink(email, baseURL!);

      // Consume the one-time token server-side, without creating a browser session
      const first = await request.get(link, { maxRedirects: 0 });
      expect(first.status()).toBe(303);
      expect(first.headers()["location"]).toContain("#access_token=");

      // Using it again must be rejected by Supabase...
      await page.goto(link);
      await expect(page).toHaveURL(/error_code=otp_expired/);

      // ...and must not have signed anyone in
      await page.goto("/transactions");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await deleteTestUser(userId);
    }
  });
});

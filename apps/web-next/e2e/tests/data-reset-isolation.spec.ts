import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  supabaseAdmin,
} from "../utils/test-helpers";

test.describe("Data Reset Isolation", () => {
  let userA: { email: string; password: string; userId: string };
  let userB: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create two test users sequentially (parallel creation can cause DB race conditions)
    userA = await createTestUser("userA");
    userB = await createTestUser("userB");
  });

  test.afterAll(async () => {
    // Best-effort cleanup - skip userA since their data was reset
    if (userB?.userId) await cleanupReferenceDataForUser(userB.userId);
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  test("resetting User A's data does not affect User B's data", async ({
    page,
  }) => {
    // Seed data for both users
    await seedReferenceDataForUser(userA.userId);
    await seedReferenceDataForUser(userB.userId);

    // Add transactions for both users
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const { data: userACats } = await supabaseAdmin
      .from("categories")
      .select("id, type")
      .eq("user_id", userA.userId);
    const { data: userBCats } = await supabaseAdmin
      .from("categories")
      .select("id, type")
      .eq("user_id", userB.userId);

    const spendCatA = userACats?.find((c: any) => c.type === "spend");
    const spendCatB = userBCats?.find((c: any) => c.type === "spend");

    const { error: txnError } = await supabaseAdmin.from("transactions").insert([
      {
        user_id: userA.userId,
        date: today,
        type: "spend",
        amount: 100.0,
        category: "Groceries",
        category_id: spendCatA?.id,
        notes: "UserA transaction to be reset",
        created_at: now,
        updated_at: now,
      },
      {
        user_id: userB.userId,
        date: today,
        type: "spend",
        amount: 200.0,
        category: "Groceries",
        category_id: spendCatB?.id,
        notes: "UserB transaction should persist",
        created_at: now,
        updated_at: now,
      },
    ]);
    if (txnError) throw new Error(`Failed to insert transactions: ${txnError.message}`);

    // User A resets their data
    await loginUser(page, userA.email, userA.password);
    await page.goto("/settings");

    // Scroll to danger zone
    await page.getByText("Danger Zone").scrollIntoViewIfNeeded();

    // Click reset button
    await page.getByRole("button", { name: /reset.*data/i }).click();

    // Confirm reset
    await page.getByRole("button", { name: /yes.*delete.*everything/i }).click();

    // Verify success
    await expect(page.getByText(/success|completed/i)).toBeVisible();

    // Verify User A's data is gone
    await page.goto("/transactions");
    await expect(page.getByText("UserA transaction to be reset")).not.toBeVisible();

    await page.goto("/categories");
    await expect(page.getByText("Groceries")).not.toBeVisible();

    // Logout User A
    await logoutUser(page);

    // Now login as User B and verify their data is intact
    await loginUser(page, userB.email, userB.password);

    // User B's transaction should still exist
    await page.goto("/transactions");
    await expect(page.getByText("UserB transaction should persist")).toBeVisible();

    // User B's categories should still exist
    await page.goto("/categories");
    await expect(page.getByText("Groceries")).toBeVisible();

    // User B's bank accounts should still exist
    await page.goto("/bank-accounts");
    await expect(page.getByText("Main Account")).toBeVisible();

    // User B's tags should still exist
    await page.goto("/tags");
    await expect(page.getByText("essentials")).toBeVisible();
  });
});

// Helper function for logout (since test-helpers has it but we need it here)
async function logoutUser(page: any) {
  // Try multiple logout patterns
  const logoutSelectors = [
    'button[aria-label="Logout"]',
    'button:has-text("Logout")',
    'button:has-text("Sign out")',
  ];

  let logoutClicked = false;
  for (const selector of logoutSelectors) {
    try {
      if (await page.locator(selector).first().isVisible({ timeout: 1000 })) {
        await page.locator(selector).first().click();
        logoutClicked = true;
        break;
      }
    } catch {
      // Try next selector
    }
  }

  // Wait for redirect to login
  try {
    await page.waitForURL(/\/login/, { timeout: 5000 });
  } catch {
    await page.goto("/login");
  }
}

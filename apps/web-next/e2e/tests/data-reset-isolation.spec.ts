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

  test("data reset properly isolates between users (RLS)", async ({
    browser,
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

    const { error: txnError } = await supabaseAdmin
      .from("transactions")
      .insert([
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
    if (txnError)
      throw new Error(`Failed to insert transactions: ${txnError.message}`);

    // Verify both users have data before reset
    const { data: userABefore } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("user_id", userA.userId);
    const { data: userBBefore } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("user_id", userB.userId);

    expect(userABefore).toHaveLength(1);
    expect(userBBefore).toHaveLength(1);

    // Create separate browser context for User A
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // User A resets their data
    await loginUser(pageA, userA.email, userA.password);
    await pageA.goto("/settings");
    await pageA.getByText("Danger Zone").scrollIntoViewIfNeeded();
    await pageA.getByRole("button", { name: /reset.*data/i }).click();
    await pageA
      .getByRole("button", { name: /yes.*delete.*everything/i })
      .click();

    // Verify success with semantic locator
    await expect(pageA.getByText(/data reset complete/i)).toBeVisible({
      timeout: 10000,
    });

    // Clean up User A's context
    await contextA.close();

    // Verify User A's data is gone in database
    const { data: userAAfter } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("user_id", userA.userId);
    const { data: userACategoriesAfter } = await supabaseAdmin
      .from("categories")
      .select("name")
      .eq("user_id", userA.userId);
    const { data: userABankAccountsAfter } = await supabaseAdmin
      .from("bank_accounts")
      .select("name")
      .eq("user_id", userA.userId);
    const { data: userATagsAfter } = await supabaseAdmin
      .from("tags")
      .select("name")
      .eq("user_id", userA.userId);

    // User A's data should be completely removed
    expect(userAAfter).toHaveLength(0);
    expect(userACategoriesAfter).toHaveLength(0);
    expect(userABankAccountsAfter).toHaveLength(0);
    expect(userATagsAfter).toHaveLength(0);

    // Verify User B's data is still intact in database
    const { data: userBAfter } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("user_id", userB.userId);
    const { data: userBCategoriesAfter } = await supabaseAdmin
      .from("categories")
      .select("name")
      .eq("user_id", userB.userId);
    const { data: userBBankAccountsAfter } = await supabaseAdmin
      .from("bank_accounts")
      .select("name")
      .eq("user_id", userB.userId);
    const { data: userBTagsAfter } = await supabaseAdmin
      .from("tags")
      .select("name")
      .eq("user_id", userB.userId);

    // User B's data should remain unchanged
    expect(userBAfter).toHaveLength(1);
    expect(userBAfter?.[0].notes).toBe("UserB transaction should persist");
    expect(userBCategoriesAfter?.length).toBeGreaterThan(0);
    expect(userBBankAccountsAfter?.length).toBeGreaterThan(0);
    expect(userBTagsAfter?.length).toBeGreaterThan(0);
  });
});

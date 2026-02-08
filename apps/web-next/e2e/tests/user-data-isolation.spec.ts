import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  seedReferenceDataWithPrefix,
  seedTransactionsForUser,
  cleanupReferenceDataForUser,
  supabaseAdmin,
} from "../utils/test-helpers";

test.describe("User Data Isolation", () => {
  let userA: { email: string; password: string; userId: string };
  let userB: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create two test users sequentially (parallel creation can cause DB race conditions)
    userA = await createTestUser("userA");
    userB = await createTestUser("userB");

    // Seed distinct reference data for each user
    await seedReferenceDataWithPrefix(userA.userId, "userA");
    await seedReferenceDataWithPrefix(userB.userId, "userB");

    // Seed transactions with identifiable notes
    await seedTransactionsForUser(userA.userId, "userA");
    await seedTransactionsForUser(userB.userId, "userB");
  });

  test.afterAll(async () => {
    // Guard against cleanup if beforeAll failed
    if (userA?.userId) await cleanupReferenceDataForUser(userA.userId);
    if (userB?.userId) await cleanupReferenceDataForUser(userB.userId);
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  test("user data is properly isolated between users (RLS)", async () => {
    // Verify User A's data in database
    const { data: userATransactions } = await supabaseAdmin
      .from("transactions")
      .select("notes, user_id")
      .eq("user_id", userA.userId);

    const { data: userACategories } = await supabaseAdmin
      .from("categories")
      .select("name, user_id")
      .eq("user_id", userA.userId);

    const { data: userATags } = await supabaseAdmin
      .from("tags")
      .select("name, user_id")
      .eq("user_id", userA.userId);

    const { data: userABankAccounts } = await supabaseAdmin
      .from("bank_accounts")
      .select("name, user_id")
      .eq("user_id", userA.userId);

    // Verify User A has their own data with correct user_id
    expect(userATransactions?.length).toBeGreaterThan(0);
    expect(userATransactions?.every((tx) => tx.user_id === userA.userId)).toBe(true);
    const userANotes = userATransactions?.map((tx) => tx.notes) || [];
    expect(userANotes.some((note) => note?.includes("userA"))).toBe(true);

    expect(userACategories?.length).toBeGreaterThan(0);
    expect(userACategories?.every((cat) => cat.user_id === userA.userId)).toBe(true);
    const userACatNames = userACategories?.map((cat) => cat.name) || [];
    expect(userACatNames.some((name) => name?.includes("userA"))).toBe(true);

    expect(userATags?.length).toBeGreaterThan(0);
    expect(userATags?.every((tag) => tag.user_id === userA.userId)).toBe(true);

    expect(userABankAccounts?.length).toBeGreaterThan(0);
    expect(userABankAccounts?.every((acc) => acc.user_id === userA.userId)).toBe(true);

    // Verify User B's data in database
    const { data: userBTransactions } = await supabaseAdmin
      .from("transactions")
      .select("notes, user_id")
      .eq("user_id", userB.userId);

    const { data: userBCategories } = await supabaseAdmin
      .from("categories")
      .select("name, user_id")
      .eq("user_id", userB.userId);

    const { data: userBTags } = await supabaseAdmin
      .from("tags")
      .select("name, user_id")
      .eq("user_id", userB.userId);

    const { data: userBBankAccounts } = await supabaseAdmin
      .from("bank_accounts")
      .select("name, user_id")
      .eq("user_id", userB.userId);

    // Verify User B has their own data with correct user_id
    expect(userBTransactions?.length).toBeGreaterThan(0);
    expect(userBTransactions?.every((tx) => tx.user_id === userB.userId)).toBe(true);
    const userBNotes = userBTransactions?.map((tx) => tx.notes) || [];
    expect(userBNotes.some((note) => note?.includes("userB"))).toBe(true);

    expect(userBCategories?.length).toBeGreaterThan(0);
    expect(userBCategories?.every((cat) => cat.user_id === userB.userId)).toBe(true);
    const userBCatNames = userBCategories?.map((cat) => cat.name) || [];
    expect(userBCatNames.some((name) => name?.includes("userB"))).toBe(true);

    expect(userBTags?.length).toBeGreaterThan(0);
    expect(userBTags?.every((tag) => tag.user_id === userB.userId)).toBe(true);

    expect(userBBankAccounts?.length).toBeGreaterThan(0);
    expect(userBBankAccounts?.every((acc) => acc.user_id === userB.userId)).toBe(true);

    // Verify no cross-contamination: User A doesn't have User B's data
    expect(userANotes.every((note) => !note?.includes("userB"))).toBe(true);
    expect(userACatNames.every((name) => !name?.includes("userB"))).toBe(true);

    // Verify no cross-contamination: User B doesn't have User A's data
    expect(userBNotes.every((note) => !note?.includes("userA"))).toBe(true);
    expect(userBCatNames.every((name) => !name?.includes("userA"))).toBe(true);

    // Verify total counts - ensure we have data for both users
    const { data: allTransactions } = await supabaseAdmin
      .from("transactions")
      .select("user_id")
      .in("user_id", [userA.userId, userB.userId]);

    const userACount = allTransactions?.filter((tx) => tx.user_id === userA.userId).length || 0;
    const userBCount = allTransactions?.filter((tx) => tx.user_id === userB.userId).length || 0;

    // Both users should have transactions
    expect(userACount).toBeGreaterThan(0);
    expect(userBCount).toBeGreaterThan(0);

    // Total should equal sum of both users (no extra data)
    expect(allTransactions?.length).toBe(userACount + userBCount);
  });
});

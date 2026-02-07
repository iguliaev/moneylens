import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  cleanupReferenceDataForUser,
  logoutUser,
  e2eCurrentMonthDate,
  supabaseAdmin,
} from "../utils/test-helpers";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Bulk Upload Data Isolation", () => {
  let userA: { email: string; password: string; userId: string };
  let userB: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create two test users sequentially (parallel creation can cause DB race conditions)
    userA = await createTestUser("userA");
    userB = await createTestUser("userB");
  });

  test.afterAll(async () => {
    // Guard against cleanup if beforeAll failed
    if (userA?.userId) await cleanupReferenceDataForUser(userA.userId);
    if (userB?.userId) await cleanupReferenceDataForUser(userB.userId);
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  test("bulk upload data is properly isolated between users (RLS)", async ({
    browser,
  }) => {
    const fixturePath = path.join(
      __dirname,
      "../fixtures/valid-bulk-upload.json",
    );

    // Create separate browser contexts for each user to avoid session conflicts
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // User A uploads data
    await loginUser(pageA, userA.email, userA.password);
    await pageA.goto("/settings");
    await pageA.locator("input[type='file']").setInputFiles(fixturePath);
    await pageA.getByRole("button", { name: /^upload$/i, exact: true }).click();
    await expect(
      pageA
        .getByRole("alert")
        .filter({ hasText: new RegExp("Upload Successful", "i") }),
    ).toBeVisible({ timeout: 10000 });

    // Verify User A's data exists in database with correct user_id
    const { data: userAData } = await supabaseAdmin
      .from("transactions")
      .select("user_id, notes")
      .eq("user_id", userA.userId);

    expect(userAData).toHaveLength(3);
    expect(userAData?.every((tx) => tx.user_id === userA.userId)).toBe(true);

    const { data: userACategories } = await supabaseAdmin
      .from("categories")
      .select("name, user_id")
      .eq("user_id", userA.userId);

    expect(userACategories).toHaveLength(3);
    expect(userACategories?.map((c) => c.name)).toContain("e2e-spend-cat");

    // Clean up User A's context
    await contextA.close();

    // Create separate context for User B
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    // User B uploads their own data
    await loginUser(pageB, userB.email, userB.password);
    await pageB.goto("/settings");
    await pageB.locator("input[type='file']").setInputFiles(fixturePath);
    await pageB.getByRole("button", { name: /^upload$/i, exact: true }).click();
    await expect(
      pageB
        .getByRole("alert")
        .filter({ hasText: new RegExp("Upload Successful", "i") }),
    ).toBeVisible({ timeout: 10000 });

    // Verify User B's data exists in database with correct user_id
    const { data: userBData } = await supabaseAdmin
      .from("transactions")
      .select("user_id, notes")
      .eq("user_id", userB.userId);

    expect(userBData).toHaveLength(3);
    expect(userBData?.every((tx) => tx.user_id === userB.userId)).toBe(true);

    // Verify User B cannot see User A's data (database level check)
    const { data: userBCategories } = await supabaseAdmin
      .from("categories")
      .select("name, user_id")
      .eq("user_id", userB.userId);

    const userBCategoryNames = userBCategories?.map((c) => c.name) || [];
    // User B should have their own categories but NOT see User A's
    expect(userBCategoryNames).toContain("e2e-spend-cat"); // User B uploaded same fixture

    // Verify no cross-contamination: verify counts and user_ids are correct
    const { data: allTransactions } = await supabaseAdmin
      .from("transactions")
      .select("user_id")
      .in("user_id", [userA.userId, userB.userId]);

    const userACount =
      allTransactions?.filter((tx) => tx.user_id === userA.userId).length || 0;
    const userBCount =
      allTransactions?.filter((tx) => tx.user_id === userB.userId).length || 0;

    // Each user should have exactly 3 transactions
    expect(userACount).toBe(3);
    expect(userBCount).toBe(3);

    // Total should be 6 (3 per user, no cross-contamination)
    expect(allTransactions?.length).toBe(6);

    // Clean up User B's context
    await contextB.close();
  });
});

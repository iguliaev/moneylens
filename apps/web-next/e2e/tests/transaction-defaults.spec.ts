import { test, expect, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  selectFromVisibleAntdDropdown,
  supabaseAdmin,
} from "../utils/test-helpers";

/**
 * The whole antd Select for a given accessible name. The combobox role sits on
 * the inner search input, whose immediate parent holds no text — the rendered
 * selection lives further up, in the `.ant-select` shell.
 */
function selectShell(page: Page, comboboxName: string) {
  return page
    .getByRole("combobox", { name: comboboxName })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', @class, ' '), ' ant-select ')][1]"
    );
}

async function openTransactionsSettingsTab(page: Page) {
  await page.goto("/settings");
  await page.getByRole("tab", { name: /^transactions$/i }).click();
  await expect(
    page.getByRole("combobox", { name: "Default transaction type" })
  ).toBeVisible();
  // The grid renders before its category/bank-account options resolve; opening a
  // Select mid-load yields an empty dropdown.
  await expect(page.locator(".ant-spin-blur")).toHaveCount(0);
}

type DefaultsTable = "user_settings" | "user_transaction_defaults";

/**
 * Resolves once the matching defaults upsert has been acknowledged by
 * PostgREST. The default type is written to `user_settings`, a per-type
 * category/bank account to `user_transaction_defaults`; supabase-js sends both
 * as `POST /rest/v1/<table>?on_conflict=...`.
 *
 * This wait is load-bearing. `DefaultValueSelect` is handed
 * `value={valueIfStillAvailable(...)}`, which stays `undefined` until the
 * write has been persisted and refetched (the plain type Select does the same
 * via `value={defaultType ?? undefined}`). While that prop is `undefined`
 * rc-select falls back to its own internal state, so a freshly clicked option
 * paints immediately — before the upsert round-trips. Asserting only on the
 * rendered value therefore returns while the request is still in flight; the
 * next `page.goto()` / `page.reload()` then aborts it and the write never
 * lands (seen against staging: the last defaults POST before the navigation
 * shows as aborted, and the Create form has nothing to prefill).
 *
 * Any status is matched so a failed upsert fails fast at the call site with
 * the real code, instead of hanging until the timeout.
 */
function waitForDefaultsWrite(page: Page, table: DefaultsTable) {
  return page.waitForResponse(
    (res) =>
      new RegExp(`/rest/v1/${table}(\\?|$)`).test(res.url()) &&
      res.request().method() === "POST",
    { timeout: 15000 }
  );
}

/**
 * Picks an option, waits for its write to actually reach the database, then
 * waits for the shell to reflect it. Both waits matter: the write wait keeps a
 * following navigation from aborting the request, the shell wait keeps the
 * assertion honest about what the user sees.
 *
 * Assumes the option is not already selected — AntD fires no `onChange` when
 * you re-pick the current value, so no upsert would go out and the write wait
 * would hang until its timeout.
 */
async function setDefaultAndConfirm(
  page: Page,
  comboboxName: string,
  optionTitle: string
) {
  const table: DefaultsTable =
    comboboxName === "Default transaction type"
      ? "user_settings"
      : "user_transaction_defaults";
  // Promise.all, not a bare pending promise: if the select throws, the
  // waitForResponse promise still gets awaited here rather than rejecting
  // unhandled at fixture teardown.
  const [res] = await Promise.all([
    waitForDefaultsWrite(page, table),
    selectFromVisibleAntdDropdown(page, comboboxName, optionTitle),
  ]);
  expect(res.ok(), `defaults upsert failed: ${res.status()}`).toBe(true);
  await expect(selectShell(page, comboboxName)).toContainText(optionTitle, {
    timeout: 15000,
  });
}

/**
 * The Create page's default-prefill effect sits behind a longer chain than a
 * settings-grid write: auth-session restore, then the type/defaults fetch,
 * then (once type is set) the category fetch — all starting fresh on this
 * page load, not warmed up by anything earlier in the test. A test whose
 * first assertion after navigating here checks a prefilled value has no
 * earlier `expect` to "absorb" that chain's latency the way later assertions
 * in the same test implicitly do, so it needs its own generous timeout
 * instead of the 10s default — otherwise a slow/cold environment (a fresh
 * deploy, a shared CI runner) turns a real-but-slow prefill into a false
 * failure.
 */
async function expectPrefilledOnCreatePage(
  locator: ReturnType<typeof selectShell>,
  text: string | RegExp
) {
  await expect(locator).toContainText(text, { timeout: 20000 });
}

test.describe("Transaction Defaults", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    testUser = await createTestUser("txn-defaults");
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    // Isolation depends on both writes landing — a swallowed failure leaks the
    // previous test's defaults into this one.
    const { error: defaultsError } = await supabaseAdmin
      .from("user_transaction_defaults")
      .delete()
      .eq("user_id", testUser.userId);
    expect(defaultsError, defaultsError?.message).toBeNull();
    const { error: settingsError } = await supabaseAdmin
      .from("user_settings")
      .update({ default_transaction_type: null })
      .eq("user_id", testUser.userId);
    expect(settingsError, settingsError?.message).toBeNull();
    await loginUser(page, testUser.email, testUser.password);
  });

  test("settings page exposes a Transactions tab with a row per type", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(page.getByRole("tab")).toHaveCount(4);

    await page.getByRole("tab", { name: /^transactions$/i }).click();

    for (const label of ["Earn", "Spend", "Save"]) {
      await expect(
        page.getByRole("combobox", { name: `Default category for ${label}` })
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", {
          name: `Default bank account for ${label}`,
        })
      ).toBeVisible();
    }
  });

  test("category options are scoped to their row's transaction type", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);

    // Seeded data has exactly one category per type: Groceries/spend,
    // Salary/earn, Savings/save. The spend row must not offer the earn one.
    await page
      .getByRole("combobox", { name: "Default category for Spend" })
      .click({ force: true });

    const dropdown = page.locator(".ant-select-dropdown:visible");
    await expect(dropdown.getByTitle(/^Groceries$/i)).toBeVisible();
    await expect(dropdown.getByTitle(/^Salary$/i)).toHaveCount(0);
  });

  test("defaults persist across a reload", async ({ page }) => {
    await openTransactionsSettingsTab(page);

    await setDefaultAndConfirm(page, "Default transaction type", "Spend");
    await setDefaultAndConfirm(page, "Default category for Spend", "Groceries");
    await setDefaultAndConfirm(
      page,
      "Default bank account for Spend",
      "Main Account"
    );

    // Each Select writes through on change, so there is no Save button to
    // await. Reloading is the honest check that the value actually reached the
    // database rather than only local state.
    await page.reload();
    await page.getByRole("tab", { name: /^transactions$/i }).click();

    await expect(selectShell(page, "Default transaction type")).toContainText(
      "Spend"
    );
    await expect(selectShell(page, "Default category for Spend")).toContainText(
      "Groceries"
    );
    await expect(
      selectShell(page, "Default bank account for Spend")
    ).toContainText("Main Account");
  });

  test("a default can be cleared again", async ({ page }) => {
    await openTransactionsSettingsTab(page);

    await setDefaultAndConfirm(page, "Default category for Earn", "Salary");

    const shell = selectShell(page, "Default category for Earn");
    await shell.hover();
    // Clearing routes through the same setDefaultsForType upsert (POST).
    const [clearRes] = await Promise.all([
      waitForDefaultsWrite(page, "user_transaction_defaults"),
      shell.locator(".ant-select-clear").click({ force: true }),
    ]);
    expect(clearRes.ok(), `clear upsert failed: ${clearRes.status()}`).toBe(
      true
    );
    await expect(shell).not.toContainText("Salary", { timeout: 15000 });

    // Reload through the helper: it waits out the grid's loading spinner, so
    // the negative assertion runs against loaded data. A bare reload resolves
    // the locator while the Select is still empty, passing this check before a
    // still-persisted "Salary" could reappear.
    await openTransactionsSettingsTab(page);
    await expect(
      selectShell(page, "Default category for Earn")
    ).not.toContainText("Salary");
  });

  test("create form pre-fills date, type, category and bank account", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await setDefaultAndConfirm(page, "Default transaction type", "Spend");
    await setDefaultAndConfirm(page, "Default category for Spend", "Groceries");
    await setDefaultAndConfirm(
      page,
      "Default bank account for Spend",
      "Main Account"
    );

    // Reached directly, with no ?type= — the sidebar/kbar entry point, which is
    // the case the stored default type exists to cover.
    await page.goto("/transactions/create");

    // DATE_PICKER_INPUT_FORMATS puts DD/MM/YYYY first, so that is what renders.
    const today = new Date();
    const expectedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
      today.getMonth() + 1
    ).padStart(2, "0")}/${today.getFullYear()}`;
    // First assertion after the create-page nav — needs the same cold-chain
    // headroom as expectPrefilledOnCreatePage (see its docstring).
    await expect(page.getByLabel("Date")).toHaveValue(expectedDate, {
      timeout: 20000,
    });

    await expectPrefilledOnCreatePage(selectShell(page, "* Type"), /spend/i);
    await expectPrefilledOnCreatePage(
      selectShell(page, "* Category"),
      "Groceries"
    );
    await expectPrefilledOnCreatePage(
      selectShell(page, "* Bank Account"),
      "Main Account"
    );
  });

  test("changing type on the create form swaps in that type's defaults", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await setDefaultAndConfirm(page, "Default category for Spend", "Groceries");
    await setDefaultAndConfirm(
      page,
      "Default bank account for Spend",
      "Main Account"
    );
    await setDefaultAndConfirm(page, "Default category for Earn", "Salary");
    await setDefaultAndConfirm(
      page,
      "Default bank account for Earn",
      "Secondary Account"
    );

    await page.goto("/transactions/create");

    await selectFromVisibleAntdDropdown(page, "* Type", "Spend");
    await expectPrefilledOnCreatePage(
      selectShell(page, "* Category"),
      "Groceries"
    );
    await expectPrefilledOnCreatePage(
      selectShell(page, "* Bank Account"),
      "Main Account"
    );

    await selectFromVisibleAntdDropdown(page, "* Type", "Earn");
    await expect(selectShell(page, "* Category")).toContainText("Salary");
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Secondary Account"
    );
  });

  test("a manually chosen bank account is not overwritten by the default", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await setDefaultAndConfirm(page, "Default transaction type", "Spend");
    await setDefaultAndConfirm(
      page,
      "Default bank account for Spend",
      "Main Account"
    );

    await page.goto("/transactions/create");
    await expectPrefilledOnCreatePage(
      selectShell(page, "* Bank Account"),
      "Main Account"
    );

    await selectFromVisibleAntdDropdown(
      page,
      "* Bank Account",
      "Secondary Account"
    );
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Secondary Account"
    );

    // Re-check once the network settles: a late defaults refetch or a
    // late-arriving options list re-runs the prefill effect, and its
    // "only fill an empty field" guard is exactly what this test verifies.
    await page.waitForLoadState("networkidle");
    await expect(selectShell(page, "* Bank Account")).toContainText(
      "Secondary Account"
    );
  });

  test("a soft-deleted default is ignored rather than shown as a raw id", async ({
    page,
  }) => {
    await openTransactionsSettingsTab(page);
    await setDefaultAndConfirm(page, "Default transaction type", "Spend");
    await setDefaultAndConfirm(page, "Default category for Spend", "Groceries");

    // The FK is ON DELETE SET NULL, which never fires for a soft delete — the
    // defaults row keeps pointing at a category the UI no longer lists.
    const { error: softDeleteError } = await supabaseAdmin
      .from("categories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", testUser.userId)
      .eq("name", "Groceries");
    expect(softDeleteError, softDeleteError?.message).toBeNull();

    await page.goto("/transactions/create");
    // The prefill effect only runs once the type is set and its category
    // options have loaded. Anchor on both so the negative assertions below
    // test a settled form instead of passing on the empty first render.
    await Promise.all([
      page.waitForResponse(
        (res) =>
          /\/rest\/v1\/categories_with_usage\?.*type=eq\.spend/.test(
            res.url()
          ) && res.request().method() === "GET"
      ),
      expectPrefilledOnCreatePage(selectShell(page, "* Type"), /spend/i),
    ]);

    const category = selectShell(page, "* Category");
    await expect(category).not.toContainText("Groceries");
    await expect(category).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}/i);

    // Restore for the remaining tests in the file
    const { error: restoreError } = await supabaseAdmin
      .from("categories")
      .update({ deleted_at: null })
      .eq("user_id", testUser.userId)
      .eq("name", "Groceries");
    expect(restoreError, restoreError?.message).toBeNull();
  });
});

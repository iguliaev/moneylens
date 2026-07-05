import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  seedReferenceDataForUser,
  cleanupReferenceDataForUser,
  cleanupTransactionsForUser,
  e2eCurrentMonthDate,
  createTransactionWithoutTags,
  getTransactionRow,
  waitForTransactionEditReady,
  selectFromVisibleAntdDropdown,
  supabaseAdmin,
} from "../utils/test-helpers";

test.describe("Transactions", () => {
  let testUser: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    // Create a single test user and seed reference data once for all tests
    testUser = await createTestUser();
    await seedReferenceDataForUser(testUser.userId);
  });

  test.afterAll(async () => {
    // Clean up categories / bank accounts / tags seeded for this user
    await cleanupReferenceDataForUser(testUser.userId);
    await deleteTestUser(testUser.userId);
  });

  test.beforeEach(async ({ page }) => {
    // Ensure each test starts from an authenticated session
    await loginUser(page, testUser.email, testUser.password);
  });

  test.afterEach(async () => {
    // Clean up transactions after each test for isolation
    await cleanupTransactionsForUser(testUser.userId);
  });

  [
    {
      categoryType: "spend",
      categoryName: "Groceries",
      amount: "150.00",
      bankAccount: "Main Account",
    },
    {
      categoryType: "earn",
      categoryName: "Salary",
      amount: "1000.00",
      bankAccount: "Main Account",
    },
    {
      categoryType: "save",
      categoryName: "Savings",
      amount: "200.00",
      bankAccount: "Main Account",
    },
  ].forEach(({ categoryType, categoryName, amount, bankAccount }) => {
    test(`user can create ${categoryType} transaction`, async ({ page }) => {
      const date = e2eCurrentMonthDate();
      const note = `txn-${categoryType}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;

      await createTransactionWithoutTags(
        page,
        date,
        categoryType,
        categoryName,
        amount,
        bankAccount,
        note
      );
    });
  });

  [
    {
      fromType: "spend",
      fromCategory: "Groceries",
      fromAmount: "150.00",
      toType: "earn",
      toCategory: "Salary",
      toAmount: "2000.00",
    },
    {
      fromType: "earn",
      fromCategory: "Salary",
      fromAmount: "1000.00",
      toType: "save",
      toCategory: "Savings",
      toAmount: "500.00",
    },
    {
      fromType: "save",
      fromCategory: "Savings",
      fromAmount: "200.00",
      toType: "spend",
      toCategory: "Groceries",
      toAmount: "75.00",
    },
  ].forEach(
    ({ fromType, fromCategory, fromAmount, toType, toCategory, toAmount }) => {
      test(`user can edit ${fromType} transaction to ${toType}`, async ({
        page,
      }) => {
        const originalDate = e2eCurrentMonthDate(15);
        const newDate = e2eCurrentMonthDate(10);
        const originalNote = `txn-edit-${fromType}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2, 8)}`;
        const newNote = `txn-edited-${toType}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2, 8)}`;

        // Create the original transaction
        const row = await createTransactionWithoutTags(
          page,
          originalDate,
          fromType,
          fromCategory,
          fromAmount,
          "Main Account",
          originalNote
        );

        // Click edit on the created row
        await row.getByRole("button", { name: "edit" }).click();
        await expect(page).toHaveURL(/\/transactions\/edit\//);
        await expect(
          page.getByRole("heading", { name: "Edit Transaction" })
        ).toBeVisible();

        // Wait for form to finish loading initial data AND background queries
        // (e.g. categories for the current type) to settle before touching dropdowns.
        // Without this, the in-flight categories fetch can cause a React re-render
        // that detaches Type dropdown options mid-click.
        await waitForTransactionEditReady(page);

        // Change date: fill() focuses + clears the input; Enter confirms the date
        // and closes the calendar popup cleanly before we touch the next field.
        // Without Enter, the popup can close on the next click and discard the
        // typed value intermittently on slow CI runners.
        await page.getByLabel("Date").fill(newDate);
        await page.keyboard.press("Enter");

        // Change type
        await selectFromVisibleAntdDropdown(page, "* Type", toType);
        await expect(
          page
            .locator(".ant-select-selection-item")
            .filter({ hasText: new RegExp(`^${toType}$`, "i") })
        ).toBeVisible();

        // Change category (should show only categories for new type)
        await selectFromVisibleAntdDropdown(page, "* Category", toCategory);
        await expect(
          page
            .locator(".ant-select-selection-item")
            .filter({ hasText: new RegExp(`^${toCategory}$`, "i") })
        ).toBeVisible();

        // Change amount
        await page.getByLabel("Amount").clear();
        await page.getByLabel("Amount").fill(toAmount);

        // Change bank account
        await selectFromVisibleAntdDropdown(
          page,
          "* Bank Account",
          "Secondary Account"
        );
        await expect(
          page.locator(".ant-select-selection-item").filter({
            hasText: /^Secondary Account$/i,
          })
        ).toBeVisible();

        // Change notes
        await page.getByLabel("Notes").clear();
        await page.getByLabel("Notes").fill(newNote);

        // Save
        await page.getByRole("button", { name: /save/i }).click();

        // Should redirect to transactions list
        await expect(page).toHaveURL(/\/transactions/);
        await expect(
          page.getByRole("heading", { name: "Transactions" })
        ).toBeVisible();

        // Switch to the new type's tab.
        // When toType is "spend" (the default tab), the list already loaded
        // spend data on redirect — clicking the already-selected tab fires no
        // new request, so waitForResponse would time out. networkidle handles
        // both cases cleanly:
        //   - tab already selected ("spend"): networkidle resolves immediately
        //   - tab changed: React synchronously starts the Supabase fetch on
        //     click, networkidle waits for that request to finish
        await page
          .getByRole("radiogroup", { name: "segmented control" })
          .getByText(new RegExp(toType, "i"))
          .click();

        // Verify the edited transaction row.
        // Extended timeout guards against slow CI re-renders while the updated
        // transaction list settles after the edit/tab-change flow.
        const editedRow = getTransactionRow(page, {
          note: newNote,
          date: newDate,
          category: toCategory,
          amount: toAmount,
          bankAccount: "Secondary Account",
        });
        await expect(editedRow).toBeVisible({ timeout: 15000 });
      });
    }
  );

  [
    {
      categoryType: "spend",
      categoryName: "Groceries",
      amount: "150.00",
      bankAccount: "Main Account",
    },
    {
      categoryType: "earn",
      categoryName: "Salary",
      amount: "1000.00",
      bankAccount: "Main Account",
    },
    {
      categoryType: "save",
      categoryName: "Savings",
      amount: "200.00",
      bankAccount: "Main Account",
    },
  ].forEach(({ categoryType, categoryName, amount, bankAccount }) => {
    test(`user can delete ${categoryType} transaction`, async ({ page }) => {
      const date = e2eCurrentMonthDate();
      const note = `txn-${categoryType}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;

      // Create transaction
      const row = await createTransactionWithoutTags(
        page,
        date,
        categoryType,
        categoryName,
        amount,
        bankAccount,
        note
      );

      // Click delete button - use page.getByRole with .first() since row is unique
      //await page.getByRole("button", { name: "delete" }).first().click();

      await row.getByRole("button", { name: "delete" }).click();

      // Handle confirmation dialog
      await expect(page.getByText("Are you sure?")).toBeVisible();
      await page.getByRole("button", { name: "Delete", exact: true }).click();

      // Verify transaction is deleted
      await expect(row).not.toBeVisible();
    });
  });

  [
    {
      categoryType: "spend",
      categoryName: "Groceries",
      amount: "150.00",
      bankAccount: "Main Account",
    },
    {
      categoryType: "earn",
      categoryName: "Salary",
      amount: "1000.00",
      bankAccount: "Main Account",
    },
    {
      categoryType: "save",
      categoryName: "Savings",
      amount: "200.00",
      bankAccount: "Main Account",
    },
  ].forEach(({ categoryType, categoryName, amount, bankAccount }) => {
    test(`user can view ${categoryType} transaction details`, async ({
      page,
    }) => {
      const date = e2eCurrentMonthDate();
      const note = `txn-${categoryType}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;

      // Create transaction
      const row = await createTransactionWithoutTags(
        page,
        date,
        categoryType,
        categoryName,
        amount,
        bankAccount,
        note
      );

      // Click show button
      await page.getByRole("button", { name: "eye" }).first().click();

      // Should navigate to show page
      await expect(
        page.getByRole("heading", { name: "Show Transaction" })
      ).toBeVisible();

      // Verify key transaction details are visible
      // Check for field labels to confirm data is loaded
      await expect(page.getByText("Date", { exact: true })).toBeVisible();
      await expect(page.getByText("Type", { exact: true })).toBeVisible();
      await expect(page.getByText("Category", { exact: true })).toBeVisible();
      await expect(page.getByText("Amount", { exact: true })).toBeVisible();

      // Verify specific values
      await expect(page.getByText(categoryType, { exact: true })).toBeVisible();
      await expect(page.getByText(categoryName)).toBeVisible();
      await expect(page.getByText(bankAccount)).toBeVisible();
      await expect(page.getByText(note)).toBeVisible();
    });
  });

  test("user can create a transaction with a tag", async ({ page }) => {
    const date = e2eCurrentMonthDate();
    const note = `txn-with-tag-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    await page.goto("/transactions/create");

    // Fill date
    await page.getByLabel("Date").fill(date);

    // Select transaction type
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(new RegExp("^spend$", "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp("^spend$", "i"))
    ).toBeVisible();

    // Select category
    await page.getByRole("combobox", { name: "* Category" }).click();
    await page.getByTitle(new RegExp("^Groceries$", "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp("^Groceries$", "i"))
    ).toBeVisible();

    // Fill amount
    await page.getByLabel("Amount").fill("75.00");

    // Select bank account
    await page.getByRole("combobox", { name: "* Bank Account" }).click();
    await page.getByTitle(new RegExp("^Main Account$", "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp("^Main Account$", "i"))
    ).toBeVisible();

    // Select tag (multi-select dropdown)
    await page.getByRole("combobox", { name: "Tags" }).click();
    await page.getByTitle(new RegExp("^essentials$", "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp("^essentials$", "i"))
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Fill notes
    await page.getByLabel("Notes").fill(note);

    // Submit form
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to transactions list
    await expect(page).toHaveURL(/\/transactions/);
    await expect(
      page.getByRole("heading", { name: "Transactions" })
    ).toBeVisible();

    // Should be on spend tab by default
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp("spend", "i"))
      .click();

    // Verify the transaction appears in the list with the tag
    const row = getTransactionRow(page, {
      note,
      date,
      category: "Groceries",
      amount: "75.00",
      bankAccount: "Main Account",
    });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Verify the tag is visible in the row
    await expect(row.getByText("essentials")).toBeVisible();
  });

  test("user can update tags on a transaction", async ({ page }) => {
    const originalDate = e2eCurrentMonthDate(15);
    const originalNote = `txn-tag-update-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    // Create a transaction without tags first
    const row = await createTransactionWithoutTags(
      page,
      originalDate,
      "spend",
      "Groceries",
      "100.00",
      "Main Account",
      originalNote
    );

    // Click edit on the created row
    await row.getByRole("button", { name: "edit" }).click();
    await expect(page).toHaveURL(/\/transactions\/edit\//);
    await expect(
      page.getByRole("heading", { name: "Edit Transaction" })
    ).toBeVisible();

    // Wait for form to finish loading
    await waitForTransactionEditReady(page);

    // Add tags to the transaction
    await page.getByRole("combobox", { name: "Tags" }).click({ force: true });
    await page
      .locator(".ant-select-dropdown:visible")
      .getByTitle(/^essentials$/i)
      .click();
    await expect(
      page
        .locator(".ant-select-selection-item")
        .filter({ hasText: /^essentials$/i })
    ).toBeVisible();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByTitle(/^monthly$/i)
      .click();
    await expect(
      page
        .locator(".ant-select-selection-item")
        .filter({ hasText: /^monthly$/i })
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Save the form
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to transactions list
    await expect(page).toHaveURL(/\/transactions/);
    await expect(
      page.getByRole("heading", { name: "Transactions" })
    ).toBeVisible();

    // Ensure we're on the spend tab
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(new RegExp("spend", "i"))
      .click();

    // Verify the transaction row still exists
    const updatedRow = getTransactionRow(page, {
      note: originalNote,
      date: originalDate,
      category: "Groceries",
      amount: "100.00",
      bankAccount: "Main Account",
    });
    await expect(updatedRow).toBeVisible({ timeout: 15000 });

    // Verify both tags are visible in the row
    await expect(updatedRow.getByText("essentials")).toBeVisible();
    await expect(updatedRow.getByText("monthly")).toBeVisible();
  });

  test("category options change based on transaction type on edit page", async ({
    page,
  }) => {
    const date = e2eCurrentMonthDate();
    const note = `txn-category-filter-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    // Create a spend transaction with Groceries category
    await createTransactionWithoutTags(
      page,
      date,
      "spend",
      "Groceries",
      "100.00",
      "Main Account",
      note
    );

    // Navigate to edit page
    await page.getByRole("button", { name: "edit" }).first().click();
    await expect(page).toHaveURL(/\/transactions\/edit\//);
    await expect(
      page.getByRole("heading", { name: "Edit Transaction" })
    ).toBeVisible();

    // Wait for the form and all background queries (initial categories fetch) to
    // settle before touching any dropdown — otherwise the in-flight categories
    // query causes a React re-render that detaches Type dropdown options mid-click.
    await waitForTransactionEditReady(page);

    // Change to earn type
    await selectFromVisibleAntdDropdown(page, "* Type", "earn");
    await expect(
      page.locator(".ant-select-selection-item").filter({ hasText: /^earn$/i })
    ).toBeVisible();

    // Open category dropdown
    await page
      .getByRole("combobox", { name: "* Category" })
      .click({ force: true });

    // Should show earn categories (Salary)
    await expect(
      page
        .locator(".ant-select-dropdown:visible")
        .getByText("Salary", { exact: true })
    ).toBeVisible();

    // Close dropdown
    await page.keyboard.press("Escape");

    // Change to save type
    await selectFromVisibleAntdDropdown(page, "* Type", "save");
    await expect(
      page.locator(".ant-select-selection-item").filter({ hasText: /^save$/i })
    ).toBeVisible();

    // Open category dropdown again
    await page
      .getByRole("combobox", { name: "* Category" })
      .click({ force: true });

    // Should show save categories (Savings)
    await expect(
      page
        .locator(".ant-select-dropdown:visible")
        .getByText("Savings", { exact: true })
    ).toBeVisible();
  });

  test("transaction amount field rejects zero but allows negative values", async ({
    page,
  }) => {
    await page.goto("/transactions/create");

    // Enter zero — should be rejected
    await page.getByLabel("Amount").fill("0");
    await page.getByLabel("Amount").blur();
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page).toHaveURL(/\/transactions\/create/);
    await expect(page.getByText("Amount cannot be zero")).toBeVisible();

    // Clear and enter a negative — the field should accept it (no validation error)
    await page.getByLabel("Amount").fill("-50");
    await page.getByLabel("Amount").blur();
    await expect(page.getByText("Amount cannot be zero")).not.toBeVisible();
  });

  test("create page preselects type from transactions list tab context", async ({
    page,
  }) => {
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { name: "Transactions" })
    ).toBeVisible();

    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(/^Earn$/i)
      .click();

    await page.getByRole("button", { name: /create/i }).click();
    await expect(page).toHaveURL(
      /\/transactions\/create\?source=transactions-list&type=earn/
    );

    const typeFormItem = page
      .locator(".ant-form-item")
      .filter({ has: page.getByText("Type", { exact: true }) });
    await expect(
      typeFormItem
        .locator(".ant-select-selection-item")
        .filter({ hasText: /^Earn$/i })
    ).toBeVisible();
  });

  test("direct create page keeps type unselected", async ({ page }) => {
    await page.goto("/transactions/create");
    await expect(
      page.getByRole("heading", { name: "Create Transaction" })
    ).toBeVisible();

    const typeFormItem = page
      .locator(".ant-form-item")
      .filter({ has: page.getByText("Type", { exact: true }) });
    await expect(typeFormItem.locator(".ant-select-selection-item")).toHaveCount(
      0
    );
  });

  test("amount range filter shows only transactions within range", async ({
    page,
  }) => {
    const date = e2eCurrentMonthDate();
    await createTransactionWithoutTags(
      page,
      date,
      "spend",
      "Groceries",
      "30.00",
      "Main Account",
      "low-amount"
    );
    await createTransactionWithoutTags(
      page,
      date,
      "spend",
      "Groceries",
      "200.00",
      "Main Account",
      "high-amount"
    );

    // Navigate directly with amount between filter applied via URL params (syncWithLocation: true)
    await page.goto(
      "/transactions?" +
        "sorters[0][field]=date&sorters[0][order]=desc" +
        "&filters[0][field]=type&filters[0][operator]=eq&filters[0][value]=spend" +
        "&filters[1][field]=amount&filters[1][operator]=between&filters[1][value][0]=100&filters[1][value][1]=999999"
    );
    await page.waitForLoadState("networkidle");

    // Only the high-amount row should be visible
    await expect(page.getByText("high-amount")).toBeVisible();
    await expect(page.getByText("low-amount")).not.toBeVisible();
  });

  test("category filter persists when moving to page 2", async ({ page }) => {
    const ts = Date.now();
    const now = new Date().toISOString();
    const otherCategoryName = `Other Spend ${ts}`;
    const otherNote = `persist-other-${ts}`;
    let otherCategoryId: string | undefined;

    try {
      const { data: groceriesCategory, error: groceriesCategoryError } =
        await supabaseAdmin
          .from("categories")
          .select("id")
          .eq("user_id", testUser.userId)
          .eq("type", "spend")
          .eq("name", "Groceries")
          .single();
      if (groceriesCategoryError || !groceriesCategory?.id) {
        throw new Error(
          `Failed to resolve Groceries category: ${
            groceriesCategoryError?.message ?? "missing category id"
          }`
        );
      }

      const { data: mainAccount, error: mainAccountError } = await supabaseAdmin
        .from("bank_accounts")
        .select("id")
        .eq("user_id", testUser.userId)
        .eq("name", "Main Account")
        .single();
      if (mainAccountError || !mainAccount?.id) {
        throw new Error(
          `Failed to resolve Main Account: ${
            mainAccountError?.message ?? "missing bank account id"
          }`
        );
      }

      const { data: otherCategory, error: otherCategoryError } =
        await supabaseAdmin
          .from("categories")
          .insert({
            user_id: testUser.userId,
            type: "spend",
            name: otherCategoryName,
            description: "category-filter-persistence",
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single();
      if (otherCategoryError || !otherCategory?.id) {
        throw new Error(
          `Failed to create secondary spend category: ${
            otherCategoryError?.message ?? "missing category id"
          }`
        );
      }
      otherCategoryId = otherCategory.id;

      const filteredTransactions = Array.from({ length: 11 }).map(
        (_, index) => ({
          user_id: testUser.userId,
          date: e2eCurrentMonthDate(15),
          type: "spend" as const,
          amount: 10 + index,
          category: "Groceries",
          category_id: groceriesCategory.id,
          bank_account_id: mainAccount.id,
          notes: `persist-groceries-${ts}-${index + 1}`,
          created_at: now,
          updated_at: now,
        })
      );

      const { error: transactionsError } = await supabaseAdmin
        .from("transactions")
        .insert([
          ...filteredTransactions,
          {
            user_id: testUser.userId,
            date: e2eCurrentMonthDate(1),
            type: "spend" as const,
            amount: 999,
            category: otherCategoryName,
            category_id: otherCategory.id,
            bank_account_id: mainAccount.id,
            notes: otherNote,
            created_at: now,
            updated_at: now,
          },
        ]);
      if (transactionsError) {
        throw new Error(
          `Failed to seed transactions: ${transactionsError.message}`
        );
      }

      await page.goto(
        "/transactions?" +
          "pageSize=10&currentPage=1" +
          "&sorters[0][field]=date&sorters[0][order]=desc" +
          "&filters[0][field]=type&filters[0][operator]=eq&filters[0][value]=spend" +
          `&filters[1][field]=category_id&filters[1][operator]=in&filters[1][value][0]=${groceriesCategory.id}`
      );
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(otherNote)).not.toBeVisible();

      const secondPageButton = page
        .locator(".ant-pagination-item")
        .filter({ hasText: /^2$/ })
        .first();
      await expect(secondPageButton).toBeVisible();
      await secondPageButton.click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/category_id/);
      await expect(
        page.getByText(new RegExp(`persist-groceries-${ts}-`)).first()
      ).toBeVisible();
      await expect(page.getByText(otherNote)).not.toBeVisible();
    } finally {
      await supabaseAdmin
        .from("transactions")
        .delete()
        .eq("user_id", testUser.userId)
        .like("notes", `persist-groceries-${ts}-%`);
      await supabaseAdmin
        .from("transactions")
        .delete()
        .eq("user_id", testUser.userId)
        .eq("notes", otherNote);
      if (otherCategoryId) {
        await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", otherCategoryId);
      }
    }
  });

  test("switching transaction type clears active list filters", async ({
    page,
  }) => {
    let hasRange416 = false;
    page.on("response", (response) => {
      if (
        response.url().includes("/transactions_with_details") &&
        response.status() === 416
      ) {
        hasRange416 = true;
      }
    });

    const { data: groceriesCategory, error: groceriesCategoryError } =
      await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("user_id", testUser.userId)
        .eq("type", "spend")
        .eq("name", "Groceries")
        .single();

    if (groceriesCategoryError || !groceriesCategory?.id) {
      throw new Error(
        `Failed to resolve Groceries category: ${
          groceriesCategoryError?.message ?? "missing category id"
        }`
      );
    }

    const { data: savingsCategory, error: savingsCategoryError } =
      await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("user_id", testUser.userId)
        .eq("type", "save")
        .eq("name", "Savings")
        .single();

    if (savingsCategoryError || !savingsCategory?.id) {
      throw new Error(
        `Failed to resolve Savings category: ${
          savingsCategoryError?.message ?? "missing category id"
        }`
      );
    }

    const { data: mainAccount, error: mainAccountError } = await supabaseAdmin
      .from("bank_accounts")
      .select("id")
      .eq("user_id", testUser.userId)
      .eq("name", "Main Account")
      .single();

    if (mainAccountError || !mainAccount?.id) {
      throw new Error(
        `Failed to resolve Main Account: ${
          mainAccountError?.message ?? "missing bank account id"
        }`
      );
    }

    const ts = Date.now();
    const now = new Date().toISOString();
    const seededSpend = Array.from({ length: 65 }).map((_, index) => ({
      user_id: testUser.userId,
      date: e2eCurrentMonthDate(15),
      type: "spend" as const,
      amount: 10 + index,
      category: "Groceries",
      category_id: groceriesCategory.id,
      bank_account_id: mainAccount.id,
      notes: `switch-spend-${ts}-${index + 1}`,
      created_at: now,
      updated_at: now,
    }));

    const { error: transactionsError } = await supabaseAdmin
      .from("transactions")
      .insert([
        ...seededSpend,
        {
          user_id: testUser.userId,
          date: e2eCurrentMonthDate(15),
          type: "save" as const,
          amount: 777,
          category: "Savings",
          category_id: savingsCategory.id,
          bank_account_id: mainAccount.id,
          notes: `switch-save-${ts}`,
          created_at: now,
          updated_at: now,
        },
      ]);
    if (transactionsError) {
      throw new Error(
        `Failed to seed transactions: ${transactionsError.message}`
      );
    }

    await page.goto(
      "/transactions?" +
        "pageSize=10&currentPage=7" +
        "&sorters[0][field]=date&sorters[0][order]=desc" +
        "&filters[0][field]=type&filters[0][operator]=eq&filters[0][value]=spend" +
        `&filters[1][field]=category_id&filters[1][operator]=in&filters[1][value][0]=${groceriesCategory.id}`
    );
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/category_id/);
    expect(hasRange416).toBeFalsy();

    hasRange416 = false;
    await page
      .getByRole("radiogroup", { name: "segmented control" })
      .getByText(/^save$/i)
      .click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/currentPage=1/);
    await expect(page).not.toHaveURL(
      /category_id|bank_account_id|tag_ids|amount/
    );
    await expect(page.getByText(new RegExp(`switch-save-${ts}`))).toBeVisible();
    expect(hasRange416).toBeFalsy();
  });

  test("category dropdown shows parent/child labels and supports parent-name search", async ({
    page,
  }) => {
    const ts = Date.now();
    const parentName = `Vacations-${ts}`;
    const childName = `Groceries-${ts}`;
    const fullLabel = `${parentName} / ${childName}`;
    const note = `txn-hierarchy-search-${ts}`;
    let parentId: string | undefined;
    let childId: string | undefined;
    let transactionId: string | undefined;

    try {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("categories")
        .insert({ user_id: testUser.userId, type: "spend", name: parentName })
        .select("id")
        .single();

      if (parentError || !parent?.id) {
        throw new Error(
          `Failed to create parent category: ${
            parentError?.message ?? "missing parent id"
          }`
        );
      }
      parentId = parent.id;

      const { data: child, error: childError } = await supabaseAdmin
        .from("categories")
        .insert({
          user_id: testUser.userId,
          type: "spend",
          name: childName,
          parent_id: parent.id,
        })
        .select("id")
        .single();

      if (childError || !child?.id) {
        throw new Error(
          `Failed to create child category: ${
            childError?.message ?? "missing child id"
          }`
        );
      }
      childId = child.id;

      await page.goto("/transactions/create");
      await page.waitForLoadState("networkidle");

      await selectFromVisibleAntdDropdown(page, "* Type", "spend");

      const categoryCombobox = page.getByRole("combobox", {
        name: "* Category",
      });
      await categoryCombobox.click();

      const categoryDropdown = page.locator(".ant-select-dropdown:visible");
      await expect(categoryDropdown.getByTitle(fullLabel)).toBeVisible();

      await categoryCombobox.fill("vacat");
      await expect(categoryDropdown.getByTitle(fullLabel)).toBeVisible();

      const { data: account, error: accountError } = await supabaseAdmin
        .from("bank_accounts")
        .select("id")
        .eq("user_id", testUser.userId)
        .eq("name", "Main Account")
        .single();
      if (accountError || !account?.id) {
        throw new Error(
          `Failed to resolve Main Account: ${
            accountError?.message ?? "missing account id"
          }`
        );
      }

      const { data: createdTransaction, error: createdTransactionError } =
        await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: testUser.userId,
            date: e2eCurrentMonthDate(),
            type: "spend",
            category_id: child.id,
            bank_account_id: account.id,
            amount: 123.45,
            notes: note,
          })
          .select("id")
          .single();

      if (createdTransactionError || !createdTransaction?.id) {
        throw new Error(
          `Failed to create transaction: ${
            createdTransactionError?.message ?? "missing transaction id"
          }`
        );
      }
      transactionId = createdTransaction.id;

      await page.goto(`/transactions/edit/${createdTransaction.id}`);
      await expect(page).toHaveURL(/\/transactions\/edit\//);
      await waitForTransactionEditReady(page);

      await expect(
        page
          .locator(".ant-select-selection-item")
          .filter({ hasText: new RegExp(`^${fullLabel}$`, "i") })
      ).toBeVisible();
    } finally {
      if (transactionId) {
        const { error: deleteTransactionError } = await supabaseAdmin
          .from("transactions")
          .delete()
          .eq("id", transactionId);
        if (deleteTransactionError) {
          throw new Error(
            `Failed to clean up transaction: ${deleteTransactionError.message}`
          );
        }
      }
      if (childId) {
        const { error: deleteChildError } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", childId);
        if (deleteChildError) {
          throw new Error(
            `Failed to clean up child category: ${deleteChildError.message}`
          );
        }
      }
      if (parentId) {
        const { error: deleteParentError } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", parentId);
        if (deleteParentError) {
          throw new Error(
            `Failed to clean up parent category: ${deleteParentError.message}`
          );
        }
      }
    }
  });

  test("transaction form category dropdown sorts by full hierarchy label", async ({
    page,
  }) => {
    const ts = Date.now();
    const parentName = `A-Utilities-${ts}`;
    const childA = `A-Heating-${ts}`;
    const childB = `A-Water-${ts}`;
    const standalone = `B-Vacation-${ts}`;
    let parentId: string | undefined;
    let childAId: string | undefined;
    let childBId: string | undefined;
    let standaloneId: string | undefined;

    try {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("categories")
        .insert({ user_id: testUser.userId, type: "spend", name: parentName })
        .select("id")
        .single();
      if (parentError || !parent?.id) {
        throw new Error(
          `Failed to create parent category: ${
            parentError?.message ?? "missing parent id"
          }`
        );
      }
      parentId = parent.id;

      const { data: childRowA, error: childErrorA } = await supabaseAdmin
        .from("categories")
        .insert({
          user_id: testUser.userId,
          type: "spend",
          name: childA,
          parent_id: parent.id,
        })
        .select("id")
        .single();
      if (childErrorA || !childRowA?.id) {
        throw new Error(
          `Failed to create first child category: ${
            childErrorA?.message ?? "missing child id"
          }`
        );
      }
      childAId = childRowA.id;

      const { data: standaloneRow, error: standaloneError } = await supabaseAdmin
        .from("categories")
        .insert({ user_id: testUser.userId, type: "spend", name: standalone })
        .select("id")
        .single();
      if (standaloneError || !standaloneRow?.id) {
        throw new Error(
          `Failed to create standalone category: ${
            standaloneError?.message ?? "missing standalone id"
          }`
        );
      }
      standaloneId = standaloneRow.id;

      const { data: childRowB, error: childErrorB } = await supabaseAdmin
        .from("categories")
        .insert({
          user_id: testUser.userId,
          type: "spend",
          name: childB,
          parent_id: parent.id,
        })
        .select("id")
        .single();
      if (childErrorB || !childRowB?.id) {
        throw new Error(
          `Failed to create second child category: ${
            childErrorB?.message ?? "missing child id"
          }`
        );
      }
      childBId = childRowB.id;

      await page.goto("/transactions/create");
      await page.waitForLoadState("networkidle");
      await selectFromVisibleAntdDropdown(page, "* Type", "spend");
      await page.getByRole("combobox", { name: "* Category" }).click();

      const categoryDropdown = page.locator(".ant-select-dropdown:visible");
      await expect(
        categoryDropdown.getByTitle(new RegExp(`^${parentName} / ${childA}$`))
      ).toBeVisible();
      const titles = await categoryDropdown
        .locator(".ant-select-item-option-content")
        .allTextContents();
      const filtered = titles.filter(
        (text) =>
          text === `${parentName} / ${childA}` ||
          text === `${parentName} / ${childB}` ||
          text === standalone
      );

      expect(filtered).toEqual([
        `${parentName} / ${childA}`,
        `${parentName} / ${childB}`,
        standalone,
      ]);
    } finally {
      if (childAId) {
        const { error } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", childAId);
        if (error) {
          throw new Error(
            `Failed to clean up first child category: ${error.message}`
          );
        }
      }
      if (childBId) {
        const { error } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", childBId);
        if (error) {
          throw new Error(
            `Failed to clean up second child category: ${error.message}`
          );
        }
      }
      if (standaloneId) {
        const { error } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", standaloneId);
        if (error) {
          throw new Error(
            `Failed to clean up standalone category: ${error.message}`
          );
        }
      }
      if (parentId) {
        const { error } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", parentId);
        if (error) {
          throw new Error(`Failed to clean up parent category: ${error.message}`);
        }
      }
    }
  });

  test("transactions list and details show consistent hierarchy label including legacy slash names", async ({
    page,
  }) => {
    const ts = Date.now();
    const date = e2eCurrentMonthDate();
    const parentName = `Category/Subcategory-${ts}`;
    const childName = `Groceries-${ts}`;
    const fullLabel = `${parentName} / ${childName}`;
    const note = `txn-hierarchy-details-${ts}`;
    let parentId: string | undefined;
    let childId: string | undefined;
    let transactionId: string | undefined;

    try {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("categories")
        .insert({ user_id: testUser.userId, type: "spend", name: parentName })
        .select("id")
        .single();

      if (parentError || !parent?.id) {
        throw new Error(
          `Failed to create parent category: ${
            parentError?.message ?? "missing parent id"
          }`
        );
      }
      parentId = parent.id;

      const { data: child, error: childError } = await supabaseAdmin
        .from("categories")
        .insert({
          user_id: testUser.userId,
          type: "spend",
          name: childName,
          parent_id: parent.id,
        })
        .select("id")
        .single();

      if (childError || !child?.id) {
        throw new Error(
          `Failed to create child category: ${
            childError?.message ?? "missing child id"
          }`
        );
      }
      childId = child.id;

      const { data: account, error: accountError } = await supabaseAdmin
        .from("bank_accounts")
        .select("id")
        .eq("user_id", testUser.userId)
        .eq("name", "Main Account")
        .single();

      if (accountError || !account?.id) {
        throw new Error(
          `Failed to resolve Main Account: ${
            accountError?.message ?? "missing account id"
          }`
        );
      }

      const { data: insertedTransaction, error: transactionError } =
        await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: testUser.userId,
            date,
            type: "spend",
            category_id: child.id,
            bank_account_id: account.id,
            amount: 87.0,
            notes: note,
          })
          .select("id")
          .single();
      if (transactionError || !insertedTransaction?.id) {
        throw new Error(
          `Failed to create transaction: ${
            transactionError?.message ?? "missing transaction id"
          }`
        );
      }
      transactionId = insertedTransaction.id;

      await page.goto("/transactions");
      await page.waitForLoadState("networkidle");
      await page
        .getByRole("radiogroup", { name: "segmented control" })
        .getByText(/^spend$/i)
        .click();

      const row = getTransactionRow(page, {
        note,
        date,
        category: fullLabel,
        amount: "87.00",
        bankAccount: "Main Account",
      });
      await expect(row.first()).toBeVisible();

      await page.goto(`/transactions/show/${insertedTransaction.id}`);
      await expect(page).toHaveURL(/\/transactions\/show\//);
      await expect(page.getByText(fullLabel)).toBeVisible();
    } finally {
      if (transactionId) {
        const { error: deleteTransactionError } = await supabaseAdmin
          .from("transactions")
          .delete()
          .eq("id", transactionId);
        if (deleteTransactionError) {
          throw new Error(
            `Failed to clean up transaction: ${deleteTransactionError.message}`
          );
        }
      }
      if (childId) {
        const { error: deleteChildError } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", childId);
        if (deleteChildError) {
          throw new Error(
            `Failed to clean up child category: ${deleteChildError.message}`
          );
        }
      }
      if (parentId) {
        const { error: deleteParentError } = await supabaseAdmin
          .from("categories")
          .delete()
          .eq("id", parentId);
        if (deleteParentError) {
          throw new Error(
            `Failed to clean up parent category: ${deleteParentError.message}`
          );
        }
      }
    }
  });

  test("transaction form shows leaf categories only", async ({ page }) => {
    const ts = Date.now();
    const parentName = `e2e-leaf-parent-${ts}`;
    const childName = `e2e-leaf-child-${ts}`;
    const fullLabel = `${parentName} / ${childName}`;

    // Seed parent + child category via admin client
    const { data: parent } = await supabaseAdmin
      .from("categories")
      .insert({
        user_id: testUser.userId,
        type: "spend",
        name: parentName,
      })
      .select("id")
      .single();

    await supabaseAdmin.from("categories").insert({
      user_id: testUser.userId,
      type: "spend",
      name: childName,
      parent_id: parent!.id,
    });

    await page.goto("/transactions/create");
    await page.waitForLoadState("networkidle");

    // Select "spend" type to load category options
    await selectFromVisibleAntdDropdown(page, "* Type", "spend");

    // Open category dropdown
    await page.getByRole("combobox", { name: "* Category" }).click();

    // Leaf child should be selectable
    await expect(
      page.locator(".ant-select-dropdown:visible").getByTitle(fullLabel)
    ).toBeVisible();

    // Parent (which has a child) should NOT appear in the options
    await expect(
      page
        .locator(".ant-select-dropdown:visible")
        .getByTitle(new RegExp(`^${parentName}$`, "i"))
    ).not.toBeVisible();
  });
});

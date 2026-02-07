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
        note,
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
          originalNote,
        );

        // Click edit on the created row
        await row.getByRole("button", { name: "edit" }).click();
        await expect(page).toHaveURL(/\/transactions\/edit\//);
        await expect(
          page.getByRole("heading", { name: "Edit Transaction" }),
        ).toBeVisible();

        // Change date
        await page.getByLabel("Date").click();
        await page.keyboard.press("Control+A"); // Select all (works on both Mac/Win)
        await page.getByLabel("Date").fill(newDate);

        // Change type
        await page
          .getByRole("combobox", { name: "* Type" })
          .click({ force: true });
        await page.getByTitle(new RegExp(`^${toType}$`, "i")).click();
        await expect(
          page.locator("#root").getByTitle(new RegExp(`^${toType}$`, "i")),
        ).toBeVisible();

        // Change category (should show only categories for new type)
        await page
          .getByRole("combobox", { name: "* Category" })
          .click({ force: true });
        await page.getByTitle(new RegExp(`^${toCategory}$`, "i")).click();
        await expect(
          page.locator("#root").getByTitle(new RegExp(`^${toCategory}$`, "i")),
        ).toBeVisible();

        // Change amount
        await page.getByLabel("Amount").clear();
        await page.getByLabel("Amount").fill(toAmount);

        // Change bank account
        await page
          .getByRole("combobox", { name: "* Bank Account" })
          .click({ force: true });
        await page.getByTitle(new RegExp("^Secondary Account$", "i")).click();
        await expect(
          page
            .locator("#root")
            .getByTitle(new RegExp("^Secondary Account$", "i")),
        ).toBeVisible();

        // Change notes
        await page.getByLabel("Notes").clear();
        await page.getByLabel("Notes").fill(newNote);

        // Save
        await page.getByRole("button", { name: /save/i }).click();

        // Should redirect to transactions list
        await expect(page).toHaveURL(/\/transactions/);
        await expect(
          page.getByRole("heading", { name: "Transactions" }),
        ).toBeVisible();

        // Switch to the new type's tab
        await page
          .getByRole("radiogroup", { name: "segmented control" })
          .getByText(new RegExp(toType, "i"))
          .click();

        // Verify the edited transaction row
        const editedRow = getTransactionRow(page, {
          note: newNote,
          date: newDate,
          category: toCategory,
          amount: toAmount,
          bankAccount: "Secondary Account",
        });
        await expect(editedRow).toBeVisible();
      });
    },
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
        note,
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
        note,
      );

      // Click show button
      await page.getByRole("button", { name: "eye" }).first().click();

      // Should navigate to show page
      await expect(
        page.getByRole("heading", { name: "Show Transaction" }),
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

  test("user can add tags to a transaction", async ({ page }) => {
    await page.goto("/transactions/create");

    // Create transaction with tags
    await page.getByLabel("Type").selectOption("spend");
    await page.getByLabel("Date").fill(e2eCurrentMonthDate());
    await page.getByLabel("Category").selectOption("Groceries");
    await page.getByLabel("Amount").fill("50.00");
    await page.getByLabel("Bank Account").selectOption("Main Account");

    // Open tags dropdown (multiple select)
    await page.getByLabel("Tags").click();

    // Select first tag
    await page.getByRole("option", { name: "essentials" }).click();

    // Close dropdown (click elsewhere or press escape)
    await page.keyboard.press("Escape");

    // Submit
    await page.getByRole("button", { name: /save|create/i }).click();

    // Verify transaction appears with tags
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText("essentials")).toBeVisible();
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
      note,
    );

    // Navigate to edit page
    await page.getByRole("button", { name: "edit" }).first().click();
    await expect(page).toHaveURL(/\/transactions\/edit\//);
    await expect(
      page.getByRole("heading", { name: "Edit Transaction" }),
    ).toBeVisible();

    // Change to earn type
    await page.getByRole("combobox", { name: "* Type" }).click({ force: true });
    await page.getByTitle(new RegExp("earn", "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp("earn", "i")),
    ).toBeVisible();

    // Open category dropdown
    await page
      .getByRole("combobox", { name: "* Category" })
      .click({ force: true });

    // Should show earn categories (Salary)
    await page.getByText("Salary");

    // Close dropdown
    await page.keyboard.press("Escape");

    // Change to save type
    await page.getByRole("combobox", { name: "* Type" }).click({ force: true });
    await page.getByTitle(new RegExp("save", "i")).click();
    await expect(
      page.locator("#root").getByTitle(new RegExp("save", "i")),
    ).toBeVisible();

    // Open category dropdown again
    await page
      .getByRole("combobox", { name: "* Category" })
      .click({ force: true });

    // Should show save categories (Savings)
    await page.getByText("Savings");
  });

  test("transaction form validation works", async ({ page }) => {
    await page.goto("/transactions/create");

    // Try to submit without filling required fields
    await page.getByRole("button", { name: /save|create/i }).click();

    // Should show validation errors
    // Ant Design shows errors inline
    await expect(page.getByText(/required|please/i)).toBeVisible();
  });
});

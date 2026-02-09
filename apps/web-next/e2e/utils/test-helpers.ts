import { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";
import type { Database, TablesInsert } from "./backend-types";

// Simple slugify implementation for tests
const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client for test setup/teardown
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey,
  { auth: { persistSession: false } },
);

export function e2eCurrentMonthDate(dayOfMonth = 15): string {
  // Use UTC + a stable day inside the month to avoid timezone + month-boundary flakiness.
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(dayOfMonth);
  return date.toISOString().slice(0, 10);
}

export async function createTestUser(seed?: string) {
  const email = seed
    ? `test-${seed}-${Date.now()}@example.com`
    : `test-${Date.now()}@example.com`;
  const password = "TestPassword123!";

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("Failed to create test user:", error.message, error);
    throw error;
  }
  // `data.user` structure comes from supabase-js response shape
  return { email, password, userId: (data as any).user.id };
}

export async function deleteTestUser(userId: string) {
  await supabaseAdmin.auth.admin.deleteUser(userId);
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/login");

  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

export async function logoutUser(page: Page) {
  // Try multiple logout patterns
  const logoutSelectors = [
    'button[aria-label="Logout"]',
    'button:has-text("Logout")',
    'button:has-text("Sign out")',
    'button[title="Logout"]',
    'a[href="/"]',
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

  // If we couldn't find logout button, try menu or dropdown
  if (!logoutClicked) {
    try {
      await page.getByRole("button", { name: /user|profile|menu/i }).click();
      await page.getByRole("button", { name: /logout|sign out/i }).click();
    } catch {
      // Fallback - just navigate to login
    }
  }

  // Wait for redirect to login
  try {
    await page.waitForURL(/\/login/, { timeout: 5000 });
  } catch {
    await page.goto("/login");
  }
}

// Seed minimal reference data (categories, bank accounts, tags) for a given user
export async function seedReferenceDataForUser(userId: string) {
  const now = new Date().toISOString();

  // Categories for each type
  const categories: TablesInsert<"categories">[] = [
    {
      user_id: userId,
      type: "spend",
      name: "Groceries",
      description: "Groceries",
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      type: "earn",
      name: "Salary",
      description: "Salary",
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      type: "save",
      name: "Savings",
      description: "Savings",
      created_at: now,
      updated_at: now,
    },
  ];
  const { error: categoriesError } = await supabaseAdmin
    .from("categories")
    .upsert(categories, { onConflict: "user_id,type,name" });
  if (categoriesError)
    throw new Error(`Failed to seed categories: ${categoriesError.message}`);

  // One bank account
  const bankAccounts: TablesInsert<"bank_accounts">[] = [
    {
      user_id: userId,
      name: "Main Account",
      description: "Primary bank account",
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      name: "Secondary Account",
      description: "Secondary bank account",
      created_at: now,
      updated_at: now,
    },
  ];
  const { error: bankAccountsError } = await supabaseAdmin
    .from("bank_accounts")
    .upsert(bankAccounts, { onConflict: "user_id,name" });
  if (bankAccountsError)
    throw new Error(
      `Failed to seed bank accounts: ${bankAccountsError.message}`,
    );

  // A couple of tags
  const tags: TablesInsert<"tags">[] = [
    {
      user_id: userId,
      name: "essentials",
      description: "Essential expenses",
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      name: "monthly",
      description: "Monthly items",
      created_at: now,
      updated_at: now,
    },
  ];
  const { error: tagsError } = await supabaseAdmin
    .from("tags")
    .upsert(tags, { onConflict: "user_id,name" });
  if (tagsError) throw new Error(`Failed to seed tags: ${tagsError.message}`);
}

// Cleanup reference data that was seeded or created for a given user
export async function cleanupReferenceDataForUser(userId: string) {
  // Delete in order to avoid foreign key constraint violations:
  // 1. transactions first (cascades to transaction_tags)
  // 2. Then reference data (tags, bank accounts, categories)

  try {
    await supabaseAdmin.from("transactions").delete().eq("user_id", userId);
  } catch {
    // noop
  }

  try {
    await supabaseAdmin.from("tags").delete().eq("user_id", userId);
  } catch {
    // noop
  }

  try {
    await supabaseAdmin.from("bank_accounts").delete().eq("user_id", userId);
  } catch {
    // noop
  }

  try {
    await supabaseAdmin.from("categories").delete().eq("user_id", userId);
  } catch {
    // noop
  }
}

// Delete all transactions for a given user
export async function cleanupTransactionsForUser(userId: string) {
  try {
    await supabaseAdmin.from("transactions").delete().eq("user_id", userId);
  } catch {
    // noop
  }
}

// Helper to create a bank account via Settings UI
export async function createBankAccount(
  page: Page,
  name: string,
  description?: string,
) {
  await page.goto("/bank-accounts");
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("textbox", { name: "* Name" }).fill(name);
  if (description !== undefined) {
    await page.getByRole("textbox", { name: "Description" }).fill(description);
  }

  await page.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/\/bank-accounts/);
  await expect(
    page.getByRole("heading", { name: "Bank Accounts" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: name, exact: true }),
  ).toBeVisible();
  if (description !== undefined) {
    await expect(
      page.getByRole("cell", { name: description, exact: true }),
    ).toBeVisible();
  }
}

// Helper to create a tag via Settings UI
export async function createTag(
  page: Page,
  name: string,
  description?: string,
) {
  await page.goto("/tags");
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("textbox", { name: "* Name" }).fill(name);
  if (description !== undefined) {
    await page.getByRole("textbox", { name: "Description" }).fill(description);
  }
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/\/tags/);
  await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: name, exact: true }),
  ).toBeVisible();
  if (description !== undefined) {
    await expect(
      page.getByRole("cell", { name: description, exact: true }),
    ).toBeVisible();
  }
}

// Helper to create a category for a given type via Settings UI
export async function createCategoryForType(
  page: Page,
  type: string,
  name: string,
  description?: string,
) {
  await page.goto("/categories");

  // Open create category modal
  await page.getByRole("button", { name: /create/i }).click();
  await expect(
    page.getByRole("heading", { name: "Create Category" }),
  ).toBeVisible();

  // Select category type
  await page.getByRole("combobox", { name: "* Type" }).click();
  await page.getByTitle(new RegExp(type, "i")).click();
  await expect(
    page.locator("#root").getByTitle(new RegExp(type, "i")),
  ).toBeVisible();

  // Fill in name and description
  await page.getByRole("textbox", { name: "* Name" }).fill(name);
  if (description !== undefined) {
    await page.getByRole("textbox", { name: "Description" }).fill(description);
  }

  // Save category
  await page.getByRole("button", { name: /save/i }).click();

  // Verify redirect back to categories list
  await expect(page).toHaveURL(/\/categories/);
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

  // Select the type tab to filter categories
  await page
    .getByRole("radiogroup", { name: "segmented control" })
    .getByText(new RegExp(type, "i"))
    .click();

  // Verify the new category is visible in the list
  await expect(
    page.getByRole("cell", { name: name, exact: true }),
  ).toBeVisible();
  if (description !== undefined) {
    await expect(
      page.getByRole("cell", { name: description, exact: true }),
    ).toBeVisible();
  }
}

/**
 * Creates a transaction without tags and returns the row locator.
 * @returns A Playwright Locator for the created transaction row that can be used
 * to locate action buttons (edit, delete, view) within the row.
 */
export async function createTransactionWithoutTags(
  page: Page,
  date: string,
  type: string,
  category: string,
  amount: string,
  bankAccount: string,
  notes: string,
) {
  await page.goto("/transactions/create");

  // Fill date
  await page.getByLabel("Date").fill(date);

  // Select transaction type
  await page.getByRole("combobox", { name: "* Type" }).click();
  await page.getByTitle(new RegExp(type, "i")).click();
  await expect(
    page.locator("#root").getByTitle(new RegExp(type, "i")),
  ).toBeVisible();

  // Select category
  await page.getByRole("combobox", { name: "* Category" }).click();
  await page.getByTitle(new RegExp(category, "i")).click();
  await expect(
    page.locator("#root").getByTitle(new RegExp(category, "i")),
  ).toBeVisible();

  // Fill amount
  await page.getByLabel("Amount").fill(amount);

  // Select bank account
  await page.getByRole("combobox", { name: "* Bank Account" }).click();
  await page.getByTitle(new RegExp(bankAccount, "i")).click();
  await expect(
    page.locator("#root").getByTitle(new RegExp(bankAccount, "i")),
  ).toBeVisible();

  // Fill notes
  await page.getByLabel("Notes").fill(notes);

  // Submit form
  await page.getByRole("button", { name: /save/i }).click();

  // Should redirect to transactions list
  await expect(page).toHaveURL(/\/transactions/);

  // Transactions list page is visible
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();

  // Select the type tab to filter categories
  await page
    .getByRole("radiogroup", { name: "segmented control" })
    .getByText(new RegExp(type, "i"))
    .click();

  // Verify the transaction appears in the list
  const row = getTransactionRow(page, {
    note: notes,
    date,
    category,
    amount,
    bankAccount,
  });
  await expect(row).toBeVisible({ timeout: 10000 });

  return row;
}

/**
 * Gets a transaction row in the transactions list by matching criteria.
 * @param page - Playwright Page object
 * @param criteria - Object containing fields to match:
 *   - note: unique note text
 *   - date: date in YYYY-MM-DD format (will be converted to MM/DD/YYYY for display)
 *   - category: category name (case-insensitive regex match)
 *   - amount: amount string (will be formatted to 2 decimal places)
 *   - bankAccount: bank account name (case-insensitive regex match)
 * @returns Playwright Locator for the matching row
 */
export function getTransactionRow(
  page: Page,
  criteria: {
    note: string;
    date: string;
    category: string;
    amount: string;
    bankAccount: string;
  },
) {
  // Date is displayed as MM/DD/YYYY, convert from YYYY-MM-DD
  const [y, m, d] = criteria.date.split("-");
  const displayDate = `${m}/${d}/${y}`;
  // Amount is displayed with 2 decimal places (e.g., 100.00, 1.01)
  const displayAmount = parseFloat(criteria.amount).toFixed(2);

  return page
    .locator("tr")
    .filter({ hasText: criteria.note })
    .filter({ hasText: displayDate })
    .filter({ hasText: new RegExp(criteria.category, "i") })
    .filter({ hasText: displayAmount })
    .filter({ hasText: new RegExp(criteria.bankAccount, "i") });
}

// Helper to select multiple tags via MultiSelect dropdown
export async function selectTags(
  page: Page,
  testId: string,
  tagNames: string[],
) {
  // Open dropdown
  await page.getByTestId(`${testId}-button`).click();

  // Select each tag
  for (const tagName of tagNames) {
    const slug = slugify(tagName);
    const option = page.getByTestId(`${testId}-option-${slug}`);
    await expect(option).toBeVisible();
    await option.click();
  }

  // Close dropdown
  await page.keyboard.press("Escape");
}

// Seed transactions for a user with specific identifiable data
export async function seedTransactionsForUser(
  userId: string,
  prefix: string, // e.g., "userA" or "userB" to make data identifiable
) {
  const now = new Date().toISOString();
  const dateForCurrentMonth = e2eCurrentMonthDate();

  // Get category IDs for the user
  const { data: categories, error: catQueryError } = await supabaseAdmin
    .from("categories")
    .select("id, type, name")
    .eq("user_id", userId);

  if (catQueryError) {
    console.error(`Failed to query categories for ${prefix}:`, catQueryError);
  }

  // Get tag IDs for the user (to associate with transactions for Top Tags panel)
  const { data: tags, error: tagQueryError } = await supabaseAdmin
    .from("tags")
    .select("id, name")
    .eq("user_id", userId);

  if (tagQueryError) {
    console.error(`Failed to query tags for ${prefix}:`, tagQueryError);
  }

  const spendCat = categories?.find((c) => c.type === "spend");
  const earnCat = categories?.find((c) => c.type === "earn");
  const saveCat = categories?.find((c) => c.type === "save");
  const tag1 = tags?.find((t) => t.name === `${prefix}-tag1`);

  const transactions = [
    {
      user_id: userId,
      date: dateForCurrentMonth,
      type: "spend" as const,
      amount: 100.0,
      category: spendCat?.name || "Groceries",
      category_id: spendCat?.id,
      notes: `${prefix}-spend-transaction`,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      date: dateForCurrentMonth,
      type: "earn" as const,
      amount: 500.0,
      category: earnCat?.name || "Salary",
      category_id: earnCat?.id,
      notes: `${prefix}-earn-transaction`,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      date: dateForCurrentMonth,
      type: "save" as const,
      amount: 200.0,
      category: saveCat?.name || "Savings",
      category_id: saveCat?.id,
      notes: `${prefix}-save-transaction`,
      created_at: now,
      updated_at: now,
    },
  ];

  const { data: insertedTxns, error } = await supabaseAdmin
    .from("transactions")
    .insert(transactions)
    .select("id");
  if (error) throw new Error(`Failed to seed transactions: ${error.message}`);

  // Associate tag1 with the first transaction (spend) so it appears in Top Tags panel
  if (insertedTxns && insertedTxns.length > 0 && tag1) {
    const { error: tagError } = await supabaseAdmin
      .from("transaction_tags")
      .insert({ transaction_id: insertedTxns[0].id, tag_id: tag1.id });
    if (tagError) {
      throw new Error(`Failed to associate tags: ${tagError.message}`);
    }
  }
}

// Seed reference data with user-specific prefixes for identification
export async function seedReferenceDataWithPrefix(
  userId: string,
  prefix: string,
) {
  const now = new Date().toISOString();

  const categories: Array<{
    user_id: string;
    type: "spend" | "earn" | "save";
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
  }> = [
    {
      user_id: userId,
      type: "spend",
      name: `${prefix}-Groceries`,
      description: `${prefix} groceries`,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      type: "earn",
      name: `${prefix}-Salary`,
      description: `${prefix} salary`,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      type: "save",
      name: `${prefix}-Savings`,
      description: `${prefix} savings`,
      created_at: now,
      updated_at: now,
    },
  ];
  const { error: catError } = await supabaseAdmin
    .from("categories")
    .upsert(categories, { onConflict: "user_id,type,name" });
  if (catError)
    throw new Error(`Failed to seed categories: ${catError.message}`);

  const bankAccounts = [
    {
      user_id: userId,
      name: `${prefix}-Bank`,
      description: `${prefix} bank account`,
      created_at: now,
      updated_at: now,
    },
  ];
  const { error: baError } = await supabaseAdmin
    .from("bank_accounts")
    .upsert(bankAccounts, { onConflict: "user_id,name" });
  if (baError)
    throw new Error(`Failed to seed bank accounts: ${baError.message}`);

  const tags = [
    {
      user_id: userId,
      name: `${prefix}-tag1`,
      description: `${prefix} tag 1`,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: userId,
      name: `${prefix}-tag2`,
      description: `${prefix} tag 2`,
      created_at: now,
      updated_at: now,
    },
  ];
  const { error: tagError } = await supabaseAdmin
    .from("tags")
    .upsert(tags, { onConflict: "user_id,name" });
  if (tagError) throw new Error(`Failed to seed tags: ${tagError.message}`);
}

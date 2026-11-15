import { test, expect } from "@playwright/test";
import dayjs from "dayjs";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
  supabaseAdmin,
} from "../utils/test-helpers";

// All transactions sit on 1 January of the current year, which is always
// inside the tab's default period (1 January to today).
const DATE = dayjs().startOf("year").format("YYYY-MM-DD");

test.describe("Dashboard Breakdown tab", () => {
  let user: { email: string; password: string; userId: string };
  const ts = Date.now();
  const names = {
    parent: `Vacation ${ts}`,
    flights: `Flights ${ts}`,
    hotels: `Hotels ${ts}`,
    food: `Food ${ts}`,
    salary: `Wages ${ts}`,
    lastYear: `LastYear ${ts}`,
    trip: `trip ${ts}`,
    main: `Main ${ts}`,
    savings: `Savings ${ts}`,
  };

  test.beforeAll(async () => {
    user = await createTestUser();
    const userId = user.userId;
    const one = async <T>(
      q: PromiseLike<{ data: T | null; error: { message: string } | null }>
    ): Promise<T> => {
      const { data, error } = await q;
      if (error || !data) throw new Error(error?.message ?? "insert failed");
      return data;
    };

    const vacation = await one(
      supabaseAdmin
        .from("categories")
        .insert({ user_id: userId, type: "spend", name: names.parent })
        .select("id")
        .single()
    );
    const children = await one(
      supabaseAdmin
        .from("categories")
        .insert(
          [names.flights, names.hotels].map((name) => ({
            user_id: userId,
            type: "spend" as const,
            name,
            parent_id: vacation.id,
          }))
        )
        .select("id, name")
    );
    const flights = children.find((c) => c.name === names.flights)!;
    const hotels = children.find((c) => c.name === names.hotels)!;
    const food = await one(
      supabaseAdmin
        .from("categories")
        .insert({ user_id: userId, type: "spend", name: names.food })
        .select("id")
        .single()
    );
    const wages = await one(
      supabaseAdmin
        .from("categories")
        .insert({ user_id: userId, type: "earn", name: names.salary })
        .select("id")
        .single()
    );
    const lastYear = await one(
      supabaseAdmin
        .from("categories")
        .insert({ user_id: userId, type: "spend", name: names.lastYear })
        .select("id")
        .single()
    );
    const tag = await one(
      supabaseAdmin
        .from("tags")
        .insert({ user_id: userId, name: names.trip })
        .select("id")
        .single()
    );
    const accounts = await one(
      supabaseAdmin
        .from("bank_accounts")
        .insert(
          [names.main, names.savings].map((name) => ({
            user_id: userId,
            name,
          }))
        )
        .select("id, name")
    );
    const main = accounts.find((a) => a.name === names.main)!;
    const savings = accounts.find((a) => a.name === names.savings)!;

    const txns = await one(
      supabaseAdmin
        .from("transactions")
        .insert(
          [
            {
              cat: flights.id,
              acct: main.id,
              type: "spend",
              amount: 100,
              note: "flights",
            },
            {
              cat: hotels.id,
              acct: main.id,
              type: "spend",
              amount: 50,
              note: "hotels",
            },
            {
              cat: food.id,
              acct: savings.id,
              type: "spend",
              amount: 30,
              note: "food",
            },
            {
              cat: wages.id,
              acct: main.id,
              type: "earn",
              amount: 500,
              note: "wages",
            },
          ].map((t) => ({
            user_id: userId,
            date: DATE,
            type: t.type as "spend" | "earn",
            amount: t.amount,
            category_id: t.cat,
            bank_account_id: t.acct,
            notes: `bd-${ts}-${t.note}`,
          }))
        )
        .select("id, notes")
    );
    // Just outside the default period (it starts on 1 January).
    const { error: oldError } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: userId,
        date: dayjs().startOf("year").subtract(1, "day").format("YYYY-MM-DD"),
        type: "spend",
        amount: 9,
        category_id: lastYear.id,
        notes: `bd-${ts}-lastyear`,
      });
    if (oldError) throw new Error(oldError.message);
    // Tag the two vacation transactions.
    const { error } = await supabaseAdmin
      .from("transaction_tags")
      .insert(
        txns
          .filter((t) => /flights|hotels/.test(t.notes ?? ""))
          .map((t) => ({ transaction_id: t.id, tag_id: tag.id }))
      );
    if (error) throw new Error(error.message);
  });

  test.afterAll(async () => {
    if (!user) return;
    await supabaseAdmin
      .from("transactions")
      .delete()
      .eq("user_id", user.userId);
    await supabaseAdmin.from("tags").delete().eq("user_id", user.userId);
    await supabaseAdmin
      .from("bank_accounts")
      .delete()
      .eq("user_id", user.userId);
    await supabaseAdmin.from("categories").delete().eq("user_id", user.userId);
    await deleteTestUser(user.userId);
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, user.email, user.password);
    await page.getByRole("tab", { name: "Breakdown" }).click();
    await expect(page.getByTestId("breakdown-tab")).toBeVisible();
  });

  // Segmented keeps its radio inputs hidden; click the visible label.
  const choose = (page: import("@playwright/test").Page, label: string) =>
    page
      .locator(".ant-segmented-item")
      .filter({ hasText: new RegExp(`^${label}$`) })
      .click();

  const row = (page: import("@playwright/test").Page, text: string) =>
    page
      .getByTestId("breakdown-tab")
      .getByRole("row")
      .filter({ hasText: text });

  test("the tab sits between Monthly Statistics and Charts", async ({
    page,
  }) => {
    const tabs = await page.getByRole("tab").allTextContents();
    const monthly = tabs.findIndex((t) => /Monthly Statistics/.test(t));
    const breakdown = tabs.findIndex((t) => t === "Breakdown");
    const charts = tabs.findIndex((t) => /Charts/.test(t));
    expect(breakdown).toBe(monthly + 1);
    expect(charts).toBe(breakdown + 1);
  });

  test("ranks categories by total with transaction counts", async ({
    page,
  }) => {
    await expect(row(page, names.flights)).toContainText("100");
    await expect(row(page, names.flights)).toContainText(
      `${names.parent} / ${names.flights}`
    );
    await expect(row(page, names.hotels)).toContainText("50");
    await expect(row(page, names.food)).toContainText("30");
    // The earn category is not in the default (spend) view.
    await expect(row(page, names.salary)).toHaveCount(0);

    const order = await page
      .getByTestId("breakdown-tab")
      .locator("tbody tr")
      .filter({ hasText: String(ts) })
      .allTextContents();
    expect(order.findIndex((t) => t.includes(names.flights))).toBeLessThan(
      order.findIndex((t) => t.includes(names.hotels))
    );
    expect(order.findIndex((t) => t.includes(names.hotels))).toBeLessThan(
      order.findIndex((t) => t.includes(names.food))
    );
  });

  test("group by parent rolls the children up", async ({ page }) => {
    await page.getByText("Group by parent").click();
    await expect(row(page, names.parent)).toContainText("150");
    await expect(row(page, names.flights)).toHaveCount(0);
    await expect(row(page, names.food)).toContainText("30");
  });

  test("switching the type shows that type's rows", async ({ page }) => {
    await choose(page, "Earn");
    await expect(row(page, names.salary)).toContainText("500");
    await expect(row(page, names.flights)).toHaveCount(0);
  });

  test("tag and bank account dimensions list their own rows", async ({
    page,
  }) => {
    await choose(page, "Tag");
    await expect(row(page, names.trip)).toContainText("150");
    await expect(page.getByText(/counts toward each of them/)).toBeVisible();

    await choose(page, "Bank account");
    await expect(row(page, names.main)).toContainText("150");
    await expect(row(page, names.savings)).toContainText("30");
    // Group-by-parent is a category-only control.
    await expect(page.getByText("Group by parent")).toHaveCount(0);
  });

  test("selecting a row shows its monthly chart, and clicking again hides it", async ({
    page,
  }) => {
    await row(page, names.flights).click();
    await expect(
      page.getByText(`${names.parent} / ${names.flights} — by month`)
    ).toBeVisible();
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();

    await row(page, names.flights).click();
    await expect(page.getByText(/— by month/)).toHaveCount(0);
  });

  test("changing the dimension clears the selection", async ({ page }) => {
    await row(page, names.flights).click();
    await expect(page.getByText(/— by month/)).toBeVisible();
    await choose(page, "Tag");
    await expect(page.getByText(/— by month/)).toHaveCount(0);
  });

  test("a row's link opens the transactions page with those rows", async ({
    page,
  }) => {
    await page.getByText("Group by parent").click();
    await expect(row(page, names.parent)).toBeVisible();
    await row(page, names.parent)
      .getByRole("link", { name: "View transactions" })
      .click();

    await expect(page).toHaveURL(/\/transactions\?/);
    for (const note of ["flights", "hotels"]) {
      await expect(
        page.getByRole("cell", { name: `bd-${ts}-${note}`, exact: true })
      ).toBeVisible();
    }
    await expect(
      page.getByRole("cell", { name: `bd-${ts}-food`, exact: true })
    ).toHaveCount(0);
  });

  test("a transaction before the period start is not counted", async ({
    page,
  }) => {
    // The default period starts on 1 January; the last-year transaction is
    // dated 31 December.
    await expect(row(page, names.flights)).toBeVisible();
    await expect(row(page, names.lastYear)).toHaveCount(0);
  });
});

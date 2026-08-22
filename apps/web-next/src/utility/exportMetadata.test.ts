import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExportMetadata } from "./exportMetadata";

function createSupabaseMock({
  categories,
  bankAccounts,
  tags,
  budgets,
  budgetCategories,
  budgetTags,
  errorTable,
}: {
  categories?: unknown[];
  bankAccounts?: unknown[];
  tags?: unknown[];
  budgets?: unknown[];
  budgetCategories?: unknown[];
  budgetTags?: unknown[];
  errorTable?: string;
}) {
  const tableData: Record<string, unknown[]> = {
    categories_with_usage: categories ?? [],
    bank_accounts_with_usage: bankAccounts ?? [],
    tags_with_usage: tags ?? [],
    budgets_with_linked: budgets ?? [],
    budget_categories: budgetCategories ?? [],
    budget_tags: budgetTags ?? [],
  };
  const from = (table: string) => {
    const result =
      table === errorTable
        ? Promise.resolve({ data: null, error: { message: `${table} failed` } })
        : Promise.resolve({ data: tableData[table] ?? [], error: null });
    return { select: () => result };
  };
  return { from } as unknown as SupabaseClient;
}

describe("fetchExportMetadata", () => {
  it("returns categories, bank accounts, tags, and budgets from the *_with_usage/*_with_linked views", async () => {
    const client = createSupabaseMock({
      categories: [
        { id: "cat-1", type: "spend", name: "Groceries", description: null, parent_name: null },
      ],
      bankAccounts: [{ name: "AmEx", description: "Primary card" }],
      tags: [{ id: "tag-1", name: "Marocco", description: null }],
    });

    const result = await fetchExportMetadata(client);

    expect(result).toEqual({
      ok: true,
      categories: [
        { type: "spend", name: "Groceries", description: null, parent_name: null },
      ],
      bank_accounts: [{ name: "AmEx", description: "Primary card" }],
      tags: [{ name: "Marocco", description: null }],
      budgets: [],
    });
  });

  it("filters out rows with a null name, type, or id", async () => {
    const client = createSupabaseMock({
      categories: [
        { id: "cat-1", type: "spend", name: "Groceries", description: null, parent_name: null },
        { id: "cat-2", type: null, name: "Bad Row", description: null, parent_name: null },
      ],
      bankAccounts: [
        { name: "AmEx", description: null },
        { name: null, description: null },
      ],
      tags: [{ id: null, name: "Orphan", description: null }],
    });

    const result = await fetchExportMetadata(client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories).toHaveLength(1);
    expect(result.bank_accounts).toEqual([{ name: "AmEx", description: null }]);
    expect(result.tags).toEqual([]);
  });

  it("surfaces an error when any query fails", async () => {
    const client = createSupabaseMock({
      categories: [],
      bankAccounts: [],
      tags: [],
      errorTable: "tags_with_usage",
    });

    const result = await fetchExportMetadata(client);

    expect(result).toEqual({ ok: false, message: "tags_with_usage failed" });
  });

  it("surfaces an error when a budgets-related query fails", async () => {
    const client = createSupabaseMock({
      errorTable: "budget_categories",
    });

    const result = await fetchExportMetadata(client);

    expect(result).toEqual({ ok: false, message: "budget_categories failed" });
  });

  it("resolves a budget's linked category to a bare root-leaf name", async () => {
    const client = createSupabaseMock({
      categories: [
        { id: "cat-1", type: "spend", name: "Fun", description: null, parent_name: null },
      ],
      budgets: [
        {
          id: "budget-1",
          name: "Fun budget",
          description: null,
          type: "spend",
          target_amount: 50,
          start_date: null,
          end_date: null,
        },
      ],
      budgetCategories: [{ budget_id: "budget-1", category_id: "cat-1" }],
    });

    const result = await fetchExportMetadata(client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.budgets).toEqual([
      {
        name: "Fun budget",
        type: "spend",
        target_amount: 50,
        description: null,
        start_date: null,
        end_date: null,
        categories: ["Fun"],
        tags: [],
      },
    ]);
  });

  it("resolves a budget's linked nested category to a Parent/Child path, and a linked tag", async () => {
    const client = createSupabaseMock({
      categories: [
        {
          id: "cat-1",
          type: "spend",
          name: "Eating out",
          description: null,
          parent_name: "Food",
        },
      ],
      tags: [{ id: "tag-1", name: "essentials", description: null }],
      budgets: [
        {
          id: "budget-1",
          name: "Food budget",
          description: "Monthly food",
          type: "spend",
          target_amount: 300,
          start_date: "2026-01-01",
          end_date: "2026-12-31",
        },
      ],
      budgetCategories: [{ budget_id: "budget-1", category_id: "cat-1" }],
      budgetTags: [{ budget_id: "budget-1", tag_id: "tag-1" }],
    });

    const result = await fetchExportMetadata(client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.budgets).toEqual([
      {
        name: "Food budget",
        type: "spend",
        target_amount: 300,
        description: "Monthly food",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        categories: ["Food/Eating out"],
        tags: ["essentials"],
      },
    ]);
  });

  it("drops a budget's link to a category or tag that is no longer live (soft-deleted)", async () => {
    const client = createSupabaseMock({
      categories: [],
      tags: [],
      budgets: [
        {
          id: "budget-1",
          name: "Orphan links budget",
          description: null,
          type: "spend",
          target_amount: 20,
          start_date: null,
          end_date: null,
        },
      ],
      budgetCategories: [{ budget_id: "budget-1", category_id: "deleted-cat" }],
      budgetTags: [{ budget_id: "budget-1", tag_id: "deleted-tag" }],
    });

    const result = await fetchExportMetadata(client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.budgets).toEqual([
      {
        name: "Orphan links budget",
        type: "spend",
        target_amount: 20,
        description: null,
        start_date: null,
        end_date: null,
        categories: [],
        tags: [],
      },
    ]);
  });
});

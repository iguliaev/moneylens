import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExportMetadata } from "./exportMetadata";

function createSupabaseMock({
  categories,
  bankAccounts,
  tags,
  errorTable,
}: {
  categories?: unknown[];
  bankAccounts?: unknown[];
  tags?: unknown[];
  errorTable?: string;
}) {
  const from = (table: string) => {
    const data =
      table === "categories_with_usage"
        ? (categories ?? [])
        : table === "bank_accounts_with_usage"
          ? (bankAccounts ?? [])
          : (tags ?? []);
    const result =
      table === errorTable
        ? Promise.resolve({ data: null, error: { message: `${table} failed` } })
        : Promise.resolve({ data, error: null });
    return { select: () => result };
  };
  return { from } as unknown as SupabaseClient;
}

describe("fetchExportMetadata", () => {
  it("returns categories, bank accounts, and tags from the *_with_usage views", async () => {
    const client = createSupabaseMock({
      categories: [
        { type: "spend", name: "Groceries", description: null, parent_name: null },
      ],
      bankAccounts: [{ name: "AmEx", description: "Primary card" }],
      tags: [{ name: "Marocco", description: null }],
    });

    const result = await fetchExportMetadata(client);

    expect(result).toEqual({
      ok: true,
      categories: [
        { type: "spend", name: "Groceries", description: null, parent_name: null },
      ],
      bank_accounts: [{ name: "AmEx", description: "Primary card" }],
      tags: [{ name: "Marocco", description: null }],
    });
  });

  it("filters out rows with a null name or type", async () => {
    const client = createSupabaseMock({
      categories: [
        { type: "spend", name: "Groceries", description: null, parent_name: null },
        { type: null, name: "Bad Row", description: null, parent_name: null },
      ],
      bankAccounts: [
        { name: "AmEx", description: null },
        { name: null, description: null },
      ],
      tags: [{ name: null, description: null }],
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
});

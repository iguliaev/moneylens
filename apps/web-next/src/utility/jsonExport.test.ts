import { describe, expect, it } from "vitest";
import {
  transactionToJsonExportRow,
  buildJsonExport,
  collectJsonExportCategories,
} from "./jsonExport";
import type { TransactionExportRow } from "./exportTransactions";

describe("transactionToJsonExportRow", () => {
  const base: TransactionExportRow = {
    date: "2026-07-01",
    type: "spend",
    category_name: null,
    category_parent_name: null,
    bank_account_name: null,
    amount: 12.34,
    tag_names: [],
    notes: null,
  };

  it("formats category as Parent/Child when a parent is present", () => {
    const row = transactionToJsonExportRow({
      ...base,
      category_name: "Eating out",
      category_parent_name: "Food",
    });
    expect(row.category).toBe("Food/Eating out");
  });

  it("uses the bare child name when there is no parent", () => {
    const row = transactionToJsonExportRow({ ...base, category_name: "Salary" });
    expect(row.category).toBe("Salary");
  });

  it("omits category entirely when uncategorized", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("category");
  });

  it("omits bank_account when unset", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("bank_account");
  });

  it("includes bank_account when present", () => {
    const row = transactionToJsonExportRow({
      ...base,
      bank_account_name: "Chase Checking",
    });
    expect(row.bank_account).toBe("Chase Checking");
  });

  it("emits tags as a real string array, not a joined string", () => {
    const row = transactionToJsonExportRow({
      ...base,
      tag_names: ["groceries", "urgent"],
    });
    expect(row.tags).toEqual(["groceries", "urgent"]);
  });

  it("omits tags when there are none", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("tags");
  });

  it("omits notes when empty", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).not.toHaveProperty("notes");
  });

  it("includes notes when present", () => {
    const row = transactionToJsonExportRow({ ...base, notes: "Weekly shopping" });
    expect(row.notes).toBe("Weekly shopping");
  });

  it("always includes date, type, and amount", () => {
    const row = transactionToJsonExportRow(base);
    expect(row).toEqual({ date: "2026-07-01", type: "spend", amount: 12.34 });
  });
});

describe("buildJsonExport", () => {
  it("wraps rows in a { categories, transactions } object matching BulkUploadPayload", () => {
    const json = buildJsonExport([
      {
        date: "2026-07-01",
        type: "spend",
        category_name: "Eating out",
        category_parent_name: "Food",
        bank_account_name: "Chase Checking",
        amount: 12.34,
        tag_names: ["groceries", "urgent"],
        notes: "Weekly shopping",
      },
    ]);
    expect(JSON.parse(json)).toEqual({
      categories: [{ type: "spend", name: "Eating out", parent: "Food" }],
      transactions: [
        {
          date: "2026-07-01",
          type: "spend",
          amount: 12.34,
          category: "Food/Eating out",
          bank_account: "Chase Checking",
          tags: ["groceries", "urgent"],
          notes: "Weekly shopping",
        },
      ],
    });
  });

  it("pretty-prints with 2-space indentation", () => {
    const json = buildJsonExport([]);
    expect(json).toBe('{\n  "categories": [],\n  "transactions": []\n}');
  });
});

describe("collectJsonExportCategories", () => {
  const base: TransactionExportRow = {
    date: "2026-07-01",
    type: "spend",
    category_name: null,
    category_parent_name: null,
    bank_account_name: null,
    amount: 12.34,
    tag_names: [],
    notes: null,
  };

  it("emits a bare { type, name } for a root-level category", () => {
    const categories = collectJsonExportCategories([
      { ...base, category_name: "Salary", type: "earn" },
    ]);
    expect(categories).toEqual([{ type: "earn", name: "Salary" }]);
  });

  it("includes parent for a nested category", () => {
    const categories = collectJsonExportCategories([
      { ...base, category_name: "Eating out", category_parent_name: "Food" },
    ]);
    expect(categories).toEqual([
      { type: "spend", name: "Eating out", parent: "Food" },
    ]);
  });

  it("skips rows with no category", () => {
    const categories = collectJsonExportCategories([base]);
    expect(categories).toEqual([]);
  });

  it("dedupes repeated (type, parent, name) triples across rows", () => {
    const categories = collectJsonExportCategories([
      { ...base, category_name: "Eating out", category_parent_name: "Food" },
      { ...base, category_name: "Eating out", category_parent_name: "Food" },
    ]);
    expect(categories).toHaveLength(1);
  });

  it("treats the same leaf name under different parents as distinct categories", () => {
    const categories = collectJsonExportCategories([
      { ...base, category_name: "Other", category_parent_name: "Food" },
      { ...base, category_name: "Other", category_parent_name: "Transport" },
    ]);
    expect(categories).toEqual([
      { type: "spend", name: "Other", parent: "Food" },
      { type: "spend", name: "Other", parent: "Transport" },
    ]);
  });

  it("keeps categories distinct when a name contains the key separator", () => {
    const categories = collectJsonExportCategories([
      { ...base, category_name: "X", category_parent_name: "Food::Sub" },
      { ...base, category_name: "Sub::X", category_parent_name: "Food" },
    ]);
    expect(categories).toHaveLength(2);
    expect(categories).toContainEqual({
      type: "spend",
      name: "X",
      parent: "Food::Sub",
    });
    expect(categories).toContainEqual({
      type: "spend",
      name: "Sub::X",
      parent: "Food",
    });
  });

  it("sorts deterministically by type, then parent, then name", () => {
    const categories = collectJsonExportCategories([
      { ...base, category_name: "Groceries" },
      { ...base, category_name: "Eating out", category_parent_name: "Food" },
      { ...base, category_name: "Salary", type: "earn" },
      { ...base, category_name: "Taxi", category_parent_name: "Transport" },
    ]);
    expect(categories).toEqual([
      { type: "earn", name: "Salary" },
      { type: "spend", name: "Groceries" },
      { type: "spend", name: "Eating out", parent: "Food" },
      { type: "spend", name: "Taxi", parent: "Transport" },
    ]);
  });
});

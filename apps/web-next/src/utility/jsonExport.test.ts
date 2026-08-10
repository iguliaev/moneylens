import { describe, expect, it } from "vitest";
import {
  transactionToJsonExportRow,
  buildJsonExport,
  categoryRecordToJsonExportCategory,
  bankAccountRecordToJsonExportBankAccount,
  tagRecordToJsonExportTag,
} from "./jsonExport";
import type { TransactionExportRow } from "./exportTransactions";
import type {
  CategoryExportRecord,
  BankAccountExportRecord,
  TagExportRecord,
  ExportMetadata,
} from "./exportMetadata";

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

describe("categoryRecordToJsonExportCategory", () => {
  it("omits parent and description when absent", () => {
    const record: CategoryExportRecord = {
      type: "spend",
      name: "Groceries",
      description: null,
      parent_name: null,
    };
    expect(categoryRecordToJsonExportCategory(record)).toEqual({
      type: "spend",
      name: "Groceries",
    });
  });

  it("includes parent and description when present", () => {
    const record: CategoryExportRecord = {
      type: "spend",
      name: "Eating out",
      description: "Vacation dining",
      parent_name: "Vacation",
    };
    expect(categoryRecordToJsonExportCategory(record)).toEqual({
      type: "spend",
      name: "Eating out",
      parent: "Vacation",
      description: "Vacation dining",
    });
  });

  it("preserves an empty-string description rather than treating it as absent", () => {
    const record: CategoryExportRecord = {
      type: "spend",
      name: "Groceries",
      description: "",
      parent_name: null,
    };
    expect(categoryRecordToJsonExportCategory(record)).toEqual({
      type: "spend",
      name: "Groceries",
      description: "",
    });
  });
});

describe("bankAccountRecordToJsonExportBankAccount", () => {
  it("omits description when absent", () => {
    const record: BankAccountExportRecord = { name: "AmEx", description: null };
    expect(bankAccountRecordToJsonExportBankAccount(record)).toEqual({ name: "AmEx" });
  });

  it("includes description when present", () => {
    const record: BankAccountExportRecord = {
      name: "AmEx",
      description: "Primary credit card",
    };
    expect(bankAccountRecordToJsonExportBankAccount(record)).toEqual({
      name: "AmEx",
      description: "Primary credit card",
    });
  });

  it("preserves an empty-string description rather than treating it as absent", () => {
    const record: BankAccountExportRecord = { name: "AmEx", description: "" };
    expect(bankAccountRecordToJsonExportBankAccount(record)).toEqual({
      name: "AmEx",
      description: "",
    });
  });
});

describe("tagRecordToJsonExportTag", () => {
  it("omits description when absent", () => {
    const record: TagExportRecord = { name: "Marocco", description: null };
    expect(tagRecordToJsonExportTag(record)).toEqual({ name: "Marocco" });
  });

  it("includes description when present", () => {
    const record: TagExportRecord = {
      name: "Marocco",
      description: "2025 trip",
    };
    expect(tagRecordToJsonExportTag(record)).toEqual({
      name: "Marocco",
      description: "2025 trip",
    });
  });
});

describe("buildJsonExport", () => {
  const emptyMetadata: ExportMetadata = { categories: [], bank_accounts: [], tags: [] };

  it("wraps rows and metadata in a { categories, bank_accounts, tags, transactions } object matching BulkUploadPayload", () => {
    const metadata: ExportMetadata = {
      categories: [
        { type: "spend", name: "Eating out", description: null, parent_name: "Food" },
      ],
      bank_accounts: [{ name: "Chase Checking", description: null }],
      tags: [
        { name: "groceries", description: null },
        { name: "urgent", description: null },
      ],
    };
    const json = buildJsonExport(
      [
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
      ],
      metadata
    );
    expect(JSON.parse(json)).toEqual({
      categories: [{ type: "spend", name: "Eating out", parent: "Food" }],
      bank_accounts: [{ name: "Chase Checking" }],
      tags: [{ name: "groceries" }, { name: "urgent" }],
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

  it("includes the full metadata library even when nothing appears on an exported transaction", () => {
    const metadata: ExportMetadata = {
      categories: [{ type: "earn", name: "Salary", description: null, parent_name: null }],
      bank_accounts: [{ name: "Unused Account", description: null }],
      tags: [{ name: "unused-tag", description: null }],
    };
    const json = buildJsonExport([], metadata);
    expect(JSON.parse(json)).toEqual({
      categories: [{ type: "earn", name: "Salary" }],
      bank_accounts: [{ name: "Unused Account" }],
      tags: [{ name: "unused-tag" }],
      transactions: [],
    });
  });

  it("sorts categories by type, then parent, then name", () => {
    const metadata: ExportMetadata = {
      categories: [
        { type: "spend", name: "Taxi", description: null, parent_name: "Transport" },
        { type: "spend", name: "Groceries", description: null, parent_name: null },
        { type: "earn", name: "Salary", description: null, parent_name: null },
        { type: "spend", name: "Eating out", description: null, parent_name: "Food" },
      ],
      bank_accounts: [],
      tags: [],
    };
    const json = buildJsonExport([], metadata);
    expect(JSON.parse(json).categories).toEqual([
      { type: "earn", name: "Salary" },
      { type: "spend", name: "Groceries" },
      { type: "spend", name: "Eating out", parent: "Food" },
      { type: "spend", name: "Taxi", parent: "Transport" },
    ]);
  });

  it("sorts bank_accounts and tags alphabetically by name", () => {
    const metadata: ExportMetadata = {
      categories: [],
      bank_accounts: [
        { name: "Wise", description: null },
        { name: "AmEx", description: null },
      ],
      tags: [
        { name: "Wise", description: null },
        { name: "AmEx", description: null },
      ],
    };
    const json = buildJsonExport([], metadata);
    expect(JSON.parse(json).bank_accounts).toEqual([{ name: "AmEx" }, { name: "Wise" }]);
    expect(JSON.parse(json).tags).toEqual([{ name: "AmEx" }, { name: "Wise" }]);
  });

  it("pretty-prints with 2-space indentation", () => {
    const json = buildJsonExport([], emptyMetadata);
    expect(json).toBe(
      '{\n  "categories": [],\n  "bank_accounts": [],\n  "tags": [],\n  "transactions": []\n}'
    );
  });

  it("adds a category/bank_account/tag referenced by a transaction but absent from the metadata library (e.g. soft-deleted), so the file can still re-import", () => {
    const row: TransactionExportRow = {
      date: "2026-07-01",
      type: "spend",
      category_name: "Side Gig",
      category_parent_name: null,
      bank_account_name: "Closed Account",
      amount: 12.34,
      tag_names: ["retired-tag"],
      notes: null,
    };
    const json = buildJsonExport([row], emptyMetadata);
    expect(JSON.parse(json)).toEqual({
      categories: [{ type: "spend", name: "Side Gig" }],
      bank_accounts: [{ name: "Closed Account" }],
      tags: [{ name: "retired-tag" }],
      transactions: [
        {
          date: "2026-07-01",
          type: "spend",
          amount: 12.34,
          category: "Side Gig",
          bank_account: "Closed Account",
          tags: ["retired-tag"],
        },
      ],
    });
  });

  it("prefers the metadata library's description over a bare row-derived entry for the same category", () => {
    const metadata: ExportMetadata = {
      categories: [
        { type: "spend", name: "Groceries", description: "Food", parent_name: null },
      ],
      bank_accounts: [],
      tags: [],
    };
    const row: TransactionExportRow = {
      date: "2026-07-01",
      type: "spend",
      category_name: "Groceries",
      category_parent_name: null,
      bank_account_name: null,
      amount: 12.34,
      tag_names: [],
      notes: null,
    };
    const json = buildJsonExport([row], metadata);
    expect(JSON.parse(json).categories).toEqual([
      { type: "spend", name: "Groceries", description: "Food" },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { escapeCsvField, buildCsv, transactionToCsvRow } from "./csvExport";
import type { TransactionExportRow } from "./exportTransactions";

describe("escapeCsvField", () => {
  it("returns plain values unchanged", () => {
    expect(escapeCsvField("Groceries")).toBe("Groceries");
    expect(escapeCsvField(42.5)).toBe("42.5");
  });

  it("quotes and escapes commas, quotes, and newlines", () => {
    expect(escapeCsvField("Food/Eating out")).toBe("Food/Eating out");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles null/undefined as empty field", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });
});

describe("transactionToCsvRow", () => {
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

  it("joins parent/child category with a slash", () => {
    const row = transactionToCsvRow({
      ...base,
      category_name: "Eating out",
      category_parent_name: "Food",
    });
    expect(row[2]).toBe("Food/Eating out");
  });

  it("uses child name only when there is no parent", () => {
    const row = transactionToCsvRow({ ...base, category_name: "Salary" });
    expect(row[2]).toBe("Salary");
  });

  it("emits an empty category field when uncategorized", () => {
    const row = transactionToCsvRow(base);
    expect(row[2]).toBe("");
  });

  it("includes the bank account name", () => {
    const row = transactionToCsvRow({
      ...base,
      bank_account_name: "Chase Checking",
    });
    expect(row[3]).toBe("Chase Checking");
  });

  it("emits an empty bank account field when unset", () => {
    const row = transactionToCsvRow(base);
    expect(row[3]).toBe("");
  });

  it("joins tags with a semicolon, preserving DB sort order", () => {
    const row = transactionToCsvRow({
      ...base,
      tag_names: ["groceries", "urgent"],
    });
    expect(row[5]).toBe("groceries;urgent");
  });
});

describe("buildCsv", () => {
  it("emits a header row and CRLF-joined data rows", () => {
    const csv = buildCsv([
      [
        "2026-07-01",
        "spend",
        "Food/Eating out",
        "Chase Checking",
        "12.34",
        "groceries;urgent",
        "",
      ],
    ]);
    expect(csv).toBe(
      "Date,Type,Category,Bank Account,Amount,Tags,Notes\r\n" +
        "2026-07-01,spend,Food/Eating out,Chase Checking,12.34,groceries;urgent,\r\n"
    );
  });
});

import type { Database } from "../types/database.types";
import type { TransactionExportRow } from "./exportTransactions";
import { formatCategoryPath } from "./csvExport";
import { downloadTextFile } from "./fileDownload";

export interface JsonExportTransaction {
  date: string;
  type: Database["public"]["Enums"]["transaction_type"];
  amount: number;
  category?: string;
  bank_account?: string;
  tags?: string[];
  notes?: string;
}

export interface JsonExportCategory {
  type: Database["public"]["Enums"]["transaction_type"];
  name: string;
  parent?: string;
}

export interface JsonExportPayload {
  categories: JsonExportCategory[];
  transactions: JsonExportTransaction[];
}

export const transactionToJsonExportRow = (
  row: TransactionExportRow
): JsonExportTransaction => {
  const result: JsonExportTransaction = {
    date: row.date,
    type: row.type,
    amount: row.amount,
  };

  const category = formatCategoryPath(row.category_name, row.category_parent_name);
  if (category) result.category = category;

  if (row.bank_account_name) result.bank_account = row.bank_account_name;
  if (row.tag_names.length > 0) result.tags = [...row.tag_names];
  if (row.notes) result.notes = row.notes;

  return result;
};

export const collectJsonExportCategories = (
  rows: TransactionExportRow[]
): JsonExportCategory[] => {
  const seen = new Map<string, JsonExportCategory>();

  for (const row of rows) {
    if (!row.category_name) continue;

    const category: JsonExportCategory = row.category_parent_name
      ? { type: row.type, name: row.category_name, parent: row.category_parent_name }
      : { type: row.type, name: row.category_name };

    // JSON-encode the tuple rather than joining on a separator: a category
    // name is free text and could otherwise collide with a different
    // (parent, name) pair, silently dropping one from the export.
    const key = JSON.stringify([
      category.type,
      category.parent ?? null,
      category.name,
    ]);
    if (!seen.has(key)) seen.set(key, category);
  }

  return [...seen.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    const parentCompare = (a.parent ?? "").localeCompare(b.parent ?? "");
    return parentCompare !== 0 ? parentCompare : a.name.localeCompare(b.name);
  });
};

export const buildJsonExport = (rows: TransactionExportRow[]): string => {
  const payload: JsonExportPayload = {
    categories: collectJsonExportCategories(rows),
    transactions: rows.map(transactionToJsonExportRow),
  };
  return JSON.stringify(payload, null, 2);
};

export const downloadJson = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "application/json;charset=utf-8;");

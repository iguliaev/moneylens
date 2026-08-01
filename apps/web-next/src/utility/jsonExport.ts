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

export interface JsonExportPayload {
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

export const buildJsonExport = (rows: TransactionExportRow[]): string => {
  const payload: JsonExportPayload = {
    transactions: rows.map(transactionToJsonExportRow),
  };
  return JSON.stringify(payload, null, 2);
};

export const downloadJson = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "application/json;charset=utf-8;");

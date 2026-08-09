import type { Database } from "../types/database.types";
import type { TransactionExportRow } from "./exportTransactions";
import type {
  BankAccountExportRecord,
  CategoryExportRecord,
  ExportMetadata,
  TagExportRecord,
} from "./exportMetadata";
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
  description?: string;
  parent?: string;
}

export interface JsonExportBankAccount {
  name: string;
  description?: string;
}

export interface JsonExportTag {
  name: string;
  description?: string;
}

export interface JsonExportPayload {
  categories: JsonExportCategory[];
  bank_accounts: JsonExportBankAccount[];
  tags: JsonExportTag[];
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

export const categoryRecordToJsonExportCategory = (
  record: CategoryExportRecord
): JsonExportCategory => {
  const result: JsonExportCategory = { type: record.type, name: record.name };
  if (record.parent_name) result.parent = record.parent_name;
  if (record.description) result.description = record.description;
  return result;
};

export const bankAccountRecordToJsonExportBankAccount = (
  record: BankAccountExportRecord
): JsonExportBankAccount => {
  const result: JsonExportBankAccount = { name: record.name };
  if (record.description) result.description = record.description;
  return result;
};

export const tagRecordToJsonExportTag = (record: TagExportRecord): JsonExportTag => {
  const result: JsonExportTag = { name: record.name };
  if (record.description) result.description = record.description;
  return result;
};

const sortJsonExportCategories = (
  categories: JsonExportCategory[]
): JsonExportCategory[] =>
  [...categories].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    const parentCompare = (a.parent ?? "").localeCompare(b.parent ?? "");
    return parentCompare !== 0 ? parentCompare : a.name.localeCompare(b.name);
  });

const sortByName = <T extends { name: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

export const buildJsonExport = (
  rows: TransactionExportRow[],
  metadata: ExportMetadata
): string => {
  const payload: JsonExportPayload = {
    categories: sortJsonExportCategories(
      metadata.categories.map(categoryRecordToJsonExportCategory)
    ),
    bank_accounts: sortByName(
      metadata.bank_accounts.map(bankAccountRecordToJsonExportBankAccount)
    ),
    tags: sortByName(metadata.tags.map(tagRecordToJsonExportTag)),
    transactions: rows.map(transactionToJsonExportRow),
  };
  return JSON.stringify(payload, null, 2);
};

export const downloadJson = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "application/json;charset=utf-8;");

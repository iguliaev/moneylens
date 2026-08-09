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

// A missing description is `null` (never `""`), so this only omits the key
// when there truly isn't one — an empty-string description is preserved.
const withOptionalDescription = <T extends object>(
  base: T,
  description: string | null
): T & { description?: string } =>
  description !== null ? { ...base, description } : base;

export const categoryRecordToJsonExportCategory = (
  record: CategoryExportRecord
): JsonExportCategory => {
  const base: JsonExportCategory = { type: record.type, name: record.name };
  if (record.parent_name !== null) base.parent = record.parent_name;
  return withOptionalDescription(base, record.description);
};

export const bankAccountRecordToJsonExportBankAccount = (
  record: BankAccountExportRecord
): JsonExportBankAccount => withOptionalDescription({ name: record.name }, record.description);

export const tagRecordToJsonExportTag = (record: TagExportRecord): JsonExportTag =>
  withOptionalDescription({ name: record.name }, record.description);

const categoryKey = (category: Pick<JsonExportCategory, "type" | "parent" | "name">): string =>
  JSON.stringify([category.type, category.parent ?? null, category.name]);

// categories_with_usage/bank_accounts_with_usage/tags_with_usage only list
// non-deleted records, but transactions_with_details still resolves the name
// of a soft-deleted category/bank account/tag on a transaction that used it
// before the delete. Without this, an export could drop an entity that a
// transaction in the very same file still references, producing a JSON file
// that fails to re-import. These referenced-but-deleted entries are added
// with no description, since the source record is gone.
const collectReferencedCategories = (rows: TransactionExportRow[]): JsonExportCategory[] => {
  const seen = new Map<string, JsonExportCategory>();
  for (const row of rows) {
    if (!row.category_name) continue;
    const category: JsonExportCategory = row.category_parent_name
      ? { type: row.type, name: row.category_name, parent: row.category_parent_name }
      : { type: row.type, name: row.category_name };
    seen.set(categoryKey(category), category);
  }
  return [...seen.values()];
};

const collectReferencedNames = (
  rows: TransactionExportRow[],
  getNames: (row: TransactionExportRow) => Iterable<string | null | undefined>
): string[] => {
  const names = new Set<string>();
  for (const row of rows) {
    for (const name of getNames(row)) {
      if (name) names.add(name);
    }
  }
  return [...names];
};

const mergeUnique = <T>(primary: T[], fallback: T[], keyOf: (item: T) => string): T[] => {
  const merged = new Map<string, T>();
  for (const item of primary) merged.set(keyOf(item), item);
  for (const item of fallback) {
    const key = keyOf(item);
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
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
  const categories = mergeUnique(
    metadata.categories.map(categoryRecordToJsonExportCategory),
    collectReferencedCategories(rows),
    categoryKey
  );
  const bankAccounts = mergeUnique(
    metadata.bank_accounts.map(bankAccountRecordToJsonExportBankAccount),
    collectReferencedNames(rows, (row) => [row.bank_account_name]).map((name) => ({ name })),
    (account) => account.name
  );
  const tags = mergeUnique(
    metadata.tags.map(tagRecordToJsonExportTag),
    collectReferencedNames(rows, (row) => row.tag_names).map((name) => ({ name })),
    (tag) => tag.name
  );

  const payload: JsonExportPayload = {
    categories: sortJsonExportCategories(categories),
    bank_accounts: sortByName(bankAccounts),
    tags: sortByName(tags),
    transactions: rows.map(transactionToJsonExportRow),
  };
  return JSON.stringify(payload, null, 2);
};

export const downloadJson = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "application/json;charset=utf-8;");

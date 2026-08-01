import type { TransactionExportRow } from "./exportTransactions";
import { downloadTextFile } from "./fileDownload";

const CSV_HEADER = [
  "Date",
  "Type",
  "Category",
  "Bank Account",
  "Amount",
  "Tags",
  "Notes",
];

export const escapeCsvField = (
  value: string | number | null | undefined
): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const formatCategoryPath = (
  name: string | null,
  parentName: string | null
): string => {
  if (!name) return "";
  return parentName ? `${parentName}/${name}` : name;
};

export const transactionToCsvRow = (row: TransactionExportRow): string[] => [
  row.date,
  row.type,
  formatCategoryPath(row.category_name, row.category_parent_name),
  row.bank_account_name ?? "",
  String(row.amount),
  [...row.tag_names].join(";"),
  row.notes ?? "",
];

export const buildCsv = (rows: string[][]): string => {
  const lines = [CSV_HEADER, ...rows].map((row) =>
    row.map(escapeCsvField).join(",")
  );
  return lines.join("\r\n") + "\r\n";
};

export const downloadCsv = (filename: string, content: string): void =>
  downloadTextFile(filename, content, "text/csv;charset=utf-8;");

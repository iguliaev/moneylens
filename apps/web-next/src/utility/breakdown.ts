import dayjs from "dayjs";
import type { TransactionType } from "../constants/transactionTypes";
import type { BreakdownDimension } from "./rpc";
import { getMonthKeysInRange } from "./monthHelpers";
import { buildTransactionsPath } from "./transactionFilterUrl";

export interface BreakdownRow {
  /** null for the "Uncategorised" / "No account" row. */
  entityId: string | null;
  name: string;
  parentName: string | null;
  /** Category ids the row stands for; null when there is nothing to link to. */
  memberIds: string[] | null;
  total: number;
  txCount: number;
}

export interface BreakdownMonthPoint {
  monthKey: string;
  total: number;
  txCount: number;
}

/** Row identity for selection: the "no entity" row has no id of its own. */
export const breakdownRowKey = (row: Pick<BreakdownRow, "entityId">): string =>
  row.entityId ?? "__none__";

/** 1 January of the current year to today. A function so it never goes stale. */
export const defaultBreakdownRange = (): [string, string] => [
  dayjs().startOf("year").format("YYYY-MM-DD"),
  dayjs().format("YYYY-MM-DD"),
];

export const isValidBreakdownRange = (start: string, end: string): boolean =>
  dayjs(start).isValid() && dayjs(end).isValid() && !dayjs(end).isBefore(start);

/**
 * One point per calendar month from the start's month to the end's month
 * inclusive, zero-filled where the RPC returned no row.
 */
export const buildMonthlySeries = (
  rows: readonly { month: string; total: number; tx_count: number }[],
  start: string,
  end: string
): BreakdownMonthPoint[] => {
  const byMonth = new Map(
    rows.map((r) => [dayjs(r.month).format("YYYY-MM"), r])
  );
  // getMonthKeysInRange treats its end as exclusive.
  const exclusiveEnd = dayjs(end)
    .startOf("month")
    .add(1, "month")
    .format("YYYY-MM-DD");
  return getMonthKeysInRange(start, exclusiveEnd).map((monthKey) => {
    const row = byMonth.get(monthKey);
    return {
      monthKey,
      total: Number(row?.total ?? 0),
      txCount: Number(row?.tx_count ?? 0),
    };
  });
};

/** True when the first or last month is only partly inside the period. */
export const coversPartialMonths = (start: string, end: string): boolean =>
  !dayjs(start).isSame(dayjs(start).startOf("month"), "day") ||
  !dayjs(end).isSame(dayjs(end).endOf("month"), "day");

/**
 * The transactions-page path listing the rows behind a Breakdown row, or null
 * when the row has nothing to filter on (Uncategorised / No account).
 */
export const breakdownRowPath = (
  dimension: BreakdownDimension,
  type: TransactionType,
  start: string,
  end: string,
  row: BreakdownRow
): string | null => {
  if (row.entityId === null) return null;
  const base = { type, startDate: start, endDate: end };
  switch (dimension) {
    case "category":
      return buildTransactionsPath({
        ...base,
        categoryIds: row.memberIds ?? [row.entityId],
      });
    case "tag":
      return buildTransactionsPath({ ...base, tagIds: [row.entityId] });
    case "bank_account":
      return buildTransactionsPath({ ...base, bankAccountIds: [row.entityId] });
  }
};

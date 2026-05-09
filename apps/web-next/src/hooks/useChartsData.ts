import { useList } from "@refinedev/core";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPES,
  type TransactionType,
} from "../constants/transactionTypes";

export interface TrendPoint {
  month: string;
  earn: number;
  spend: number;
  save: number;
}

export interface TagTotal {
  tag: string;
  type: TransactionType;
  total: number;
}

export interface CategorySpendPoint {
  monthKey: string;
  category: string;
  total: number;
}

export interface TagSpendPoint {
  monthKey: string;
  tag: string;
  total: number;
}

const isTransactionType = (v: string | null): v is TransactionType =>
  v !== null && Object.values(TRANSACTION_TYPES).includes(v as TransactionType);

const getMonthKeysInRange = (startDate: string, endDate: string): string[] => {
  const monthKeys: string[] = [];
  let cursor = dayjs(startDate).startOf("month");
  const rangeEnd = dayjs(endDate).startOf("month");

  while (cursor.isBefore(rangeEnd)) {
    monthKeys.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return monthKeys;
};

const formatMonthLabel = (month: string) => dayjs(month).format("MMM YY");

export function useChartsData(startDate: string, endDate: string) {
  const filters = [
    { field: "month", operator: "gte" as const, value: startDate },
    { field: "month", operator: "lt" as const, value: endDate },
  ];

  const { query: trendQuery } = useList({
    resource: "view_monthly_totals",
    filters,
    sorters: [{ field: "month", order: "asc" }],
    pagination: { mode: "off" },
  });

  const { query: catQuery } = useList({
    resource: "view_monthly_category_totals",
    filters,
    pagination: { mode: "off" },
  });

  const { query: tagQuery } = useList({
    resource: "view_monthly_tagged_type_totals",
    filters,
    pagination: { mode: "off" },
  });

  const loading =
    trendQuery.isLoading || catQuery.isLoading || tagQuery.isLoading;

  // Build trend data
  const trendMonthKeys = getMonthKeysInRange(startDate, endDate);
  const trendMap: Record<string, TrendPoint> = Object.fromEntries(
    trendMonthKeys.map((monthKey) => [
      monthKey,
      {
        month: formatMonthLabel(`${monthKey}-01`),
        earn: 0,
        spend: 0,
        save: 0,
      },
    ])
  );

  for (const row of trendQuery.data?.data ?? []) {
    if (!row.month || !isTransactionType(row.type)) continue;
    const monthKey = dayjs(row.month).format("YYYY-MM");
    if (!trendMap[monthKey]) continue;
    trendMap[monthKey][row.type] += Number(row.total) || 0;
  }
  const trend = trendMonthKeys.map((monthKey) => trendMap[monthKey]);

  // Build category spend breakdown
  const categorySpendByMonth: CategorySpendPoint[] = [];
  for (const row of catQuery.data?.data ?? []) {
    if (!isTransactionType(row.type)) continue;
    if (row.type === TRANSACTION_TYPES.SPEND && row.month) {
      categorySpendByMonth.push({
        monthKey: dayjs(row.month).format("YYYY-MM"),
        category: row.category ?? "Unknown",
        total: Number(row.total) || 0,
      });
    }
  }

  // Build tag aggregation and tag spend breakdown
  const tagMap: Record<string, TagTotal> = {};
  const tagSpendByMonth: TagSpendPoint[] = [];
  for (const row of tagQuery.data?.data ?? []) {
    if (!isTransactionType(row.type) || !row.tags?.length) continue;
    for (const tag of row.tags) {
      const key = `${row.type}__${tag}`;
      if (!tagMap[key]) tagMap[key] = { tag, type: row.type, total: 0 };
      tagMap[key].total += Number(row.total) || 0;

      if (row.type === TRANSACTION_TYPES.SPEND && row.month) {
        tagSpendByMonth.push({
          monthKey: dayjs(row.month).format("YYYY-MM"),
          tag,
          total: Number(row.total) || 0,
        });
      }
    }
  }
  const tags = Object.values(tagMap).sort((a, b) => b.total - a.total);

  return { trend, tags, categorySpendByMonth, tagSpendByMonth, loading };
}

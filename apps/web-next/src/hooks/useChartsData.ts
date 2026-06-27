import { useMemo } from "react";
import { useList } from "@refinedev/core";
import dayjs from "dayjs";
import type { Tables } from "../types/database.types";
import {
  TRANSACTION_TYPES,
  type TransactionType,
} from "../constants/transactionTypes";
import { getMonthKeysInRange, formatMonthLabel } from "../utility/monthHelpers";
import { toError } from "../utility/errors";

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

type MonthlyTotalsRow = Pick<
  Tables<"view_monthly_totals">,
  "month" | "total" | "type"
>;
type MonthlyCategoryTotalsRow = Pick<
  Tables<"view_monthly_category_totals">,
  "category" | "month" | "total" | "type"
>;
type MonthlyTaggedTypeTotalsRow = Pick<
  Tables<"view_monthly_tagged_type_totals">,
  "month" | "tags" | "total" | "type"
>;

const isTransactionType = (v: string | null): v is TransactionType =>
  v !== null && Object.values(TRANSACTION_TYPES).includes(v as TransactionType);

export function useChartsData(
  startDate: string,
  endDate: string,
  enabled = true
) {
  const filters = [
    { field: "month", operator: "gte" as const, value: startDate },
    { field: "month", operator: "lt" as const, value: endDate },
  ];

  const { query: trendQuery } = useList<MonthlyTotalsRow>({
    resource: "view_monthly_totals",
    filters,
    sorters: [{ field: "month", order: "asc" }],
    pagination: { mode: "off" },
    queryOptions: { enabled },
  });

  const { query: catQuery } = useList<MonthlyCategoryTotalsRow>({
    resource: "view_monthly_category_totals",
    filters,
    pagination: { mode: "off" },
    queryOptions: { enabled },
  });

  const { query: tagQuery } = useList<MonthlyTaggedTypeTotalsRow>({
    resource: "view_monthly_tagged_type_totals",
    filters,
    pagination: { mode: "off" },
    queryOptions: { enabled },
  });

  const loading =
    trendQuery.isLoading || catQuery.isLoading || tagQuery.isLoading;
  const error =
    toError(trendQuery.error, "Failed to load chart data.") ??
    toError(catQuery.error, "Failed to load chart data.") ??
    toError(tagQuery.error, "Failed to load chart data.");

  const trendMonthKeys = useMemo(
    () => getMonthKeysInRange(startDate, endDate),
    [startDate, endDate]
  );

  const trend = useMemo<TrendPoint[]>(() => {
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
    return trendMonthKeys.map((monthKey) => trendMap[monthKey]);
  }, [trendQuery.data, trendMonthKeys]);

  const categorySpendByMonth = useMemo<CategorySpendPoint[]>(() => {
    const result: CategorySpendPoint[] = [];
    for (const row of catQuery.data?.data ?? []) {
      if (!isTransactionType(row.type)) continue;
      if (row.type === TRANSACTION_TYPES.SPEND && row.month) {
        result.push({
          monthKey: dayjs(row.month).format("YYYY-MM"),
          category: row.category ?? "Unknown",
          total: Number(row.total) || 0,
        });
      }
    }
    return result;
  }, [catQuery.data]);

  const { tags, tagSpendByMonth } = useMemo<{
    tags: TagTotal[];
    tagSpendByMonth: TagSpendPoint[];
  }>(() => {
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
    return {
      tags: Object.values(tagMap).sort((a, b) => b.total - a.total),
      tagSpendByMonth,
    };
  }, [tagQuery.data]);

  return { trend, tags, categorySpendByMonth, tagSpendByMonth, loading, error };
}

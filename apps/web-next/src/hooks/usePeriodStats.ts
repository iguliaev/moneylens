import { useList } from "@refinedev/core";
import type { Tables } from "../types/database.types";
import {
  TRANSACTION_TYPES,
  type TransactionType,
} from "../constants/transactionTypes";
import { getPreviousPeriodRange } from "../utility/dateRanges";
import { toError } from "../utility/errors";

export interface CategorySummary {
  category_name: string;
  type: TransactionType;
  total: number;
}

export interface TypeSummary {
  type: TransactionType;
  total: number;
}

type MonthlyTotalsRow = Pick<
  Tables<"view_monthly_totals">,
  "month" | "total" | "type"
>;
type YearlyTotalsRow = Pick<
  Tables<"view_yearly_totals">,
  "year" | "total" | "type"
>;
type MonthlyCategoryTotalsRow = Pick<
  Tables<"view_monthly_category_totals">,
  "category" | "month" | "total" | "type"
>;
type YearlyCategoryTotalsRow = Pick<
  Tables<"view_yearly_category_totals">,
  "category" | "year" | "total" | "type"
>;

const isTransactionType = (value: string | null): value is TransactionType =>
  value !== null &&
  Object.values(TRANSACTION_TYPES).includes(value as TransactionType);

const mapTypeSummary = (
  rows: (MonthlyTotalsRow | YearlyTotalsRow)[]
): TypeSummary[] =>
  rows.flatMap((row) =>
    isTransactionType(row.type)
      ? [{ type: row.type, total: Number(row.total) || 0 }]
      : []
  );

const mapCategorySummary = (
  rows: (MonthlyCategoryTotalsRow | YearlyCategoryTotalsRow)[]
): CategorySummary[] =>
  rows.flatMap((row) =>
    isTransactionType(row.type)
      ? [
          {
            category_name: row.category || "Unknown",
            type: row.type,
            total: Number(row.total) || 0,
          },
        ]
      : []
  );

interface UsePeriodStatsParams {
  period: "month" | "year";
  startDate: string;
  endDate: string;
}

export function usePeriodStats({
  period,
  startDate,
  endDate,
}: UsePeriodStatsParams) {
  const typesResource =
    period === "year" ? "view_yearly_totals" : "view_monthly_totals";
  const categoriesResource =
    period === "year"
      ? "view_yearly_category_totals"
      : "view_monthly_category_totals";
  const dateField = period === "year" ? "year" : "month";

  const { prevStart, prevEnd } = getPreviousPeriodRange(
    period,
    startDate,
    endDate
  );

  const currentFilters = [
    { field: dateField, operator: "gte" as const, value: startDate },
    { field: dateField, operator: "lt" as const, value: endDate },
  ];
  const prevFilters = [
    { field: dateField, operator: "gte" as const, value: prevStart },
    { field: dateField, operator: "lt" as const, value: prevEnd },
  ];

  const { query: typeQuery } = useList<MonthlyTotalsRow | YearlyTotalsRow>({
    resource: typesResource,
    filters: currentFilters,
    pagination: { mode: "off" },
  });

  const { query: categoryQuery } = useList<
    MonthlyCategoryTotalsRow | YearlyCategoryTotalsRow
  >({
    resource: categoriesResource,
    filters: currentFilters,
    pagination: { mode: "off" },
  });

  const { query: prevTypeQuery } = useList<MonthlyTotalsRow | YearlyTotalsRow>({
    resource: typesResource,
    filters: prevFilters,
    pagination: { mode: "off" },
  });

  const typeSummary = mapTypeSummary(typeQuery.data?.data ?? []);
  const categorySummary = mapCategorySummary(categoryQuery.data?.data ?? []);
  const previousTypeSummary = prevTypeQuery.data
    ? mapTypeSummary(prevTypeQuery.data.data ?? [])
    : null;

  const loading =
    typeQuery.isLoading || categoryQuery.isLoading || prevTypeQuery.isLoading;
  const error =
    toError(typeQuery.error, "Failed to load period stats.") ??
    toError(categoryQuery.error, "Failed to load period stats.") ??
    toError(prevTypeQuery.error, "Failed to load period stats.");

  return { typeSummary, categorySummary, previousTypeSummary, loading, error };
}

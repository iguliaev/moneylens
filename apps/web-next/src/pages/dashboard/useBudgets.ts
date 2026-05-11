import { useList } from "@refinedev/core";
import type { Tables } from "../../types/database.types";
import { type TransactionType } from "../../constants/transactionTypes";
import { toError } from "../../utility/errors";

export interface BudgetProgress {
  id: string;
  name: string;
  description: string | null;
  type: TransactionType;
  target_amount: number;
  start_date: string | null;
  end_date: string | null;
  current_amount: number;
  created_at: string;
  updated_at: string;
}

// The full generated view row type — all columns are nullable because
// Supabase views cannot declare NOT NULL constraints.
type BudgetViewRow = Tables<"budgets_with_linked">;

export const useBudgets = () => {
  const { query } = useList({
    resource: "budgets_with_linked",
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { mode: "off" },
  });

  // Assert to the real view row shape so all nullable columns are explicit
  // and type-checked in the mapper. (useList's default BaseRecord generic
  // cannot accept id: string | null, which is why we cast here rather than
  // use a generic that rewrites the generated id type.)
  const rows = (query.data?.data ?? []) as BudgetViewRow[];

  const budgets: BudgetProgress[] = rows.flatMap((b) => {
    if (!b.id || !b.name || !b.type || b.created_at == null || b.updated_at == null)
      return [];
    return [
      {
        id: b.id,
        name: b.name,
        description: b.description,
        type: b.type,
        target_amount: Number(b.target_amount) || 0,
        current_amount: Number(b.current_amount) || 0,
        start_date: b.start_date,
        end_date: b.end_date,
        created_at: b.created_at,
        updated_at: b.updated_at,
      },
    ];
  });

  // isLoading: true only on the first fetch (no cached data) — safe to drive
  // a full <Skeleton /> without flickering on background refetches.
  // isFetching: true on any active fetch — callers can use this for subtle
  // refresh indicators without hiding already-loaded data.
  return {
    budgets,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: toError(query.error, "Failed to load budgets."),
    refresh: query.refetch,
  };
};

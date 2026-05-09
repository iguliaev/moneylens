import { useList } from "@refinedev/core";
import type { Tables } from "../../types/database.types";
import { type TransactionType } from "../../constants/transactionTypes";

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

type BudgetsWithLinkedRow = Omit<
  Pick<
    Tables<"budgets_with_linked">,
    | "id"
    | "name"
    | "description"
    | "type"
    | "target_amount"
    | "current_amount"
    | "start_date"
    | "end_date"
    | "created_at"
    | "updated_at"
  >,
  "id"
> & { id?: string };

export const useBudgets = () => {
  const { query } = useList<BudgetsWithLinkedRow>({
    resource: "budgets_with_linked",
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { mode: "off" },
  });

  const budgets: BudgetProgress[] = (query.data?.data ?? []).flatMap((b) => {
    if (!b.id || !b.name || !b.type || b.created_at == null || b.updated_at == null)
      return [];
    return [
      {
        id: String(b.id),
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

  return { budgets, loading: query.isFetching, refresh: query.refetch };
};

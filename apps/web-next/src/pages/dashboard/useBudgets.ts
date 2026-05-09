import { useList } from "@refinedev/core";
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

export const useBudgets = () => {
  const { query } = useList<BudgetProgress>({
    resource: "budgets_with_linked",
    pagination: { mode: "off" },
  });

  const budgets = (query.data?.data ?? []).map((b) => ({
    ...b,
    target_amount: Number(b.target_amount),
    current_amount: Number(b.current_amount),
  }));

  return { budgets, loading: query.isLoading, refresh: query.refetch };
};

import { useEffect, useState, useCallback } from "react";
import { message } from "antd";
import { supabaseClient } from "../../utility";
import { TransactionType } from "../../constants/transactionTypes";

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
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseClient.rpc("get_budget_progress");
    if (error) {
      message.error("Failed to load budgets");
      console.error("get_budget_progress error:", error);
    } else if (data) {
      setBudgets(
        (data as BudgetProgress[]).map((b) => ({
          ...b,
          target_amount: Number(b.target_amount),
          current_amount: Number(b.current_amount),
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  return { budgets, loading, refresh: fetchBudgets };
};

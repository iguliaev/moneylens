import type { TransactionType } from "../constants/transactionTypes";

export type BudgetAlertLevel = "over" | "warn" | "none";

export interface BudgetAlertState {
  /** Display percent, capped at 100 for the Progress bar */
  percent: number;
  /** Uncapped percent for threshold comparisons */
  rawPercent: number;
  alertLevel: BudgetAlertLevel;
}

/**
 * Derives alert state for a budget based on current vs target amount.
 * Only "spend" budgets get threshold alerts — warn at ≥80%, over at ≥100%.
 */
export function getBudgetAlertState(
  currentAmount: number,
  targetAmount: number,
  type: TransactionType,
): BudgetAlertState {
  const rawPercent =
    targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 100) : 0;
  const percent = Math.min(100, rawPercent);
  const isSpend = type === "spend";

  const alertLevel: BudgetAlertLevel =
    isSpend && rawPercent >= 100
      ? "over"
      : isSpend && rawPercent >= 80
        ? "warn"
        : "none";

  return { percent, rawPercent, alertLevel };
}

/** strokeColor override for the AntD <Progress> warn state */
export const WARN_STROKE_COLOR = "#faad14";

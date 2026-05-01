import type { TransactionType } from "../constants/transactionTypes";

export type BudgetAlertLevel = "over" | "warn" | "none";

export interface BudgetAlertState {
  /** Display percent, clamped to 0–100 for the Progress bar */
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
  // Clamp to [0, 100]: negative currentAmount (e.g. refunds) must not produce
  // a negative percent, which AntD <Progress> cannot render correctly.
  const percent = Math.max(0, Math.min(100, rawPercent));
  const isSpend = type === "spend";

  const alertLevel: BudgetAlertLevel =
    isSpend && rawPercent >= 100
      ? "over"
      : isSpend && rawPercent >= 80
        ? "warn"
        : "none";

  return { percent, rawPercent, alertLevel };
}

/**
 * Derives the AntD <Progress> status prop from alert state.
 * Shared by the dashboard BudgetsSection and the budget list page so both
 * render the same colours for the same budget.
 */
export function getProgressStatus(
  alertLevel: BudgetAlertLevel,
  percent: number,
  type: TransactionType,
): "normal" | "exception" | "success" {
  if (alertLevel === "warn") return "normal";
  if (alertLevel === "over") return "exception";
  // At 100 % an earn/save budget is complete — show success.
  if (percent >= 100) return type === "spend" ? "exception" : "success";
  // Below threshold: save is always on-track (success), spend is always at-risk
  // (exception), earn is neutral (normal).
  if (type === "save") return "success";
  if (type === "spend") return "exception";
  return "normal";
}

/** strokeColor override for the AntD <Progress> warn state */
export const WARN_STROKE_COLOR = "#faad14";

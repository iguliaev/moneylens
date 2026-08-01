import { useNavigation } from "@refinedev/core";
import { EmptyState } from "./EmptyState";
import React from "react";

/**
 * Empty state hooks for different resource types (named useX since each calls
 * useNavigation() internally, per React's rules of hooks).
 * Each returns a configured EmptyState element with title, description, and navigation.
 */

export const useTransactionEmptyState = (): React.ReactNode => {
  const { create } = useNavigation();
  return (
    <EmptyState
      title="No Transactions Yet"
      description="Start tracking your finances by adding your first transaction."
      actionLabel="Add Transaction"
      onAction={() => create("transactions")}
    />
  );
};

export const useBudgetEmptyState = (): React.ReactNode => {
  const { create } = useNavigation();
  return (
    <EmptyState
      title="No Budgets Yet"
      description="Create a budget to track your spending goals and stay on target."
      actionLabel="Create Budget"
      onAction={() => create("budgets")}
    />
  );
};

export const useCategoryEmptyState = (): React.ReactNode => {
  const { create } = useNavigation();
  return (
    <EmptyState
      title="No Categories Yet"
      description="Add categories to organize and track your transactions better."
      actionLabel="Add Category"
      onAction={() => create("categories")}
    />
  );
};

export const useBankAccountEmptyState = (): React.ReactNode => {
  const { create } = useNavigation();
  return (
    <EmptyState
      title="No Bank Accounts Yet"
      description="Link your bank accounts to start tracking all your transactions in one place."
      actionLabel="Add Bank Account"
      onAction={() => create("bank_accounts")}
    />
  );
};

export const useTagEmptyState = (): React.ReactNode => {
  const { create } = useNavigation();
  return (
    <EmptyState
      title="No Tags Yet"
      description="Create tags to label and filter your transactions by custom attributes."
      actionLabel="Add Tag"
      onAction={() => create("tags")}
    />
  );
};

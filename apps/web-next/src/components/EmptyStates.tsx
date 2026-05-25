import { useNavigation } from "@refinedev/core";
import { EmptyState } from "./EmptyState";
import React from "react";

/**
 * Empty state helpers for different resource types.
 * Each helper returns a component configured with appropriate title, description, and navigation.
 */

export const getTransactionEmptyState = (): React.ReactNode => {
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

export const getBudgetEmptyState = (): React.ReactNode => {
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

export const getCategoryEmptyState = (): React.ReactNode => {
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

export const getBankAccountEmptyState = (): React.ReactNode => {
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

export const getTagEmptyState = (): React.ReactNode => {
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

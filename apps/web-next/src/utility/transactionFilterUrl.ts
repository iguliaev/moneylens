import { stringifyTableParams, type CrudFilter } from "@refinedev/core";
import type { TransactionType } from "../constants/transactionTypes";

// Must match TAG_IDS_OR_KEY in pages/transactions/list.tsx: the list reads its
// tag filter back out of the URL by this key.
export const TAG_IDS_OR_KEY = "tag_ids_or";

export interface TransactionFilterSpec {
  type: TransactionType;
  startDate?: string | null;
  endDate?: string | null;
  /** Matches any of these categories (OR). Empty or missing means no constraint. */
  categoryIds?: string[];
  /** Matches transactions carrying any of these tags (OR). Empty or missing means no constraint. */
  tagIds?: string[];
}

const dateFilters = (
  startDate?: string | null,
  endDate?: string | null
): CrudFilter[] => {
  if (startDate && endDate) {
    return [
      { field: "date", operator: "between", value: [startDate, endDate] },
    ];
  }
  if (startDate) return [{ field: "date", operator: "gte", value: startDate }];
  if (endDate) return [{ field: "date", operator: "lte", value: endDate }];
  return [];
};

/**
 * The transactions page's filters for a spec. Top-level filters combine with
 * AND, so categories AND tags, each an OR within its own set.
 */
export const buildTransactionFilters = (
  spec: TransactionFilterSpec
): CrudFilter[] => {
  const filters: CrudFilter[] = [
    { field: "type", operator: "eq", value: spec.type },
    ...dateFilters(spec.startDate, spec.endDate),
  ];
  if (spec.categoryIds?.length) {
    filters.push({
      field: "category_id",
      operator: "in",
      value: spec.categoryIds,
    });
  }
  if (spec.tagIds?.length) {
    filters.push({
      key: TAG_IDS_OR_KEY,
      operator: "or",
      value: spec.tagIds.map((tagId) => ({
        field: "tag_ids",
        operator: "ina",
        value: [tagId],
      })),
    });
  }
  return filters;
};

/** Path (with query string) to the transactions page showing the spec's rows. */
export const buildTransactionsPath = (spec: TransactionFilterSpec): string =>
  `/transactions?${stringifyTableParams({
    sorters: [],
    filters: buildTransactionFilters(spec),
  })}`;

export interface BudgetLinkSource {
  type: TransactionType;
  startDate: string | null;
  endDate: string | null;
  /** Category ids linked to the budget, soft-deleted ones already removed. */
  categoryIds: string[];
  /** Tag ids linked to the budget, soft-deleted ones already removed. */
  tagIds: string[];
}

/**
 * The transactions-page path for a budget, or null when it has no live links
 * (such a budget matches nothing, so there is nothing to show).
 *
 * `descendantsOf` maps a category id to itself plus all its descendants
 * (category_hierarchy), because the budget rule counts a linked parent's
 * children too.
 */
export const budgetTransactionsPath = (
  budget: BudgetLinkSource,
  descendantsOf: ReadonlyMap<string, readonly string[]>
): string | null => {
  if (budget.categoryIds.length === 0 && budget.tagIds.length === 0)
    return null;

  const categoryIds = [
    ...new Set(
      budget.categoryIds.flatMap((id) => descendantsOf.get(id) ?? [id])
    ),
  ];
  return buildTransactionsPath({
    type: budget.type,
    startDate: budget.startDate,
    endDate: budget.endDate,
    categoryIds,
    tagIds: budget.tagIds,
  });
};

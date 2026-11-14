import { useMemo } from "react";
import { useList } from "@refinedev/core";
import type { TransactionType } from "../constants/transactionTypes";
import { budgetTransactionsPath } from "../utility/transactionFilterUrl";

interface LinkableBudget {
  id: string;
  type: TransactionType;
  start_date: string | null;
  end_date: string | null;
}

const all = { pagination: { mode: "off" as const } };

/**
 * Resolves a budget to the transactions page that lists the rows behind its
 * current amount. Returns null for a budget with no live links.
 *
 * Reads the raw link tables, so a link to a soft-deleted category or tag is
 * dropped here by checking it against the live *_with_usage views, the same
 * way the budget view's SQL ignores it.
 */
export const useBudgetTransactionsLink = () => {
  const links = {
    categories: useList({ resource: "budget_categories", ...all }),
    tags: useList({ resource: "budget_tags", ...all }),
    liveCategories: useList({ resource: "categories_with_usage", ...all }),
    liveTags: useList({ resource: "tags_with_usage", ...all }),
    hierarchy: useList({ resource: "category_hierarchy", ...all }),
  };
  const queries = Object.values(links).map((l) => l.query);
  const loading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;

  const rows = <T>(data?: { data: unknown[] }): T[] =>
    (data?.data ?? []) as T[];

  const categoriesData = links.categories.query.data;
  const tagsData = links.tags.query.data;
  const liveCategoriesData = links.liveCategories.query.data;
  const liveTagsData = links.liveTags.query.data;
  const hierarchyData = links.hierarchy.query.data;

  const lookup = useMemo(() => {
    const bcRows = rows<{ budget_id: string; category_id: string }>(
      categoriesData
    );
    const btRows = rows<{ budget_id: string; tag_id: string }>(tagsData);
    const liveCategoryRows = rows<{ id: string | null }>(liveCategoriesData);
    const liveTagRows = rows<{ id: string | null }>(liveTagsData);
    const hierarchyRows = rows<{ ancestor_id: string; descendant_id: string }>(
      hierarchyData
    );
    const liveCategories = new Set(liveCategoryRows.map((r) => r.id));
    const liveTags = new Set(liveTagRows.map((r) => r.id));

    const descendantsOf = new Map<string, string[]>();
    for (const h of hierarchyRows) {
      const list = descendantsOf.get(h.ancestor_id) ?? [];
      list.push(h.descendant_id);
      descendantsOf.set(h.ancestor_id, list);
    }

    const categoriesByBudget = new Map<string, string[]>();
    for (const l of bcRows) {
      if (!liveCategories.has(l.category_id)) continue;
      const list = categoriesByBudget.get(l.budget_id) ?? [];
      list.push(l.category_id);
      categoriesByBudget.set(l.budget_id, list);
    }
    const tagsByBudget = new Map<string, string[]>();
    for (const l of btRows) {
      if (!liveTags.has(l.tag_id)) continue;
      const list = tagsByBudget.get(l.budget_id) ?? [];
      list.push(l.tag_id);
      tagsByBudget.set(l.budget_id, list);
    }
    return { descendantsOf, categoriesByBudget, tagsByBudget };
  }, [
    categoriesData,
    tagsData,
    liveCategoriesData,
    liveTagsData,
    hierarchyData,
  ]);

  const pathFor = (budget: LinkableBudget): string | null =>
    loading || error
      ? null
      : budgetTransactionsPath(
          {
            type: budget.type,
            startDate: budget.start_date,
            endDate: budget.end_date,
            categoryIds: lookup.categoriesByBudget.get(budget.id) ?? [],
            tagIds: lookup.tagsByBudget.get(budget.id) ?? [],
          },
          lookup.descendantsOf
        );

  return { pathFor, loading, error };
};

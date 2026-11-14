import { useEffect, useMemo } from "react";
import { useList } from "@refinedev/core";
import type { TransactionType } from "../constants/transactionTypes";
import {
  budgetTransactionsPath,
  groupLiveLinks,
} from "../utility/transactionFilterUrl";

interface LinkableBudget {
  id: string;
  type: TransactionType;
  start_date: string | null;
  end_date: string | null;
}

export type BudgetLinkStatus = "loading" | "error" | "ready";

/**
 * Resolves a budget to the transactions page that lists the rows behind its
 * current amount. `pathFor` returns null for a budget with no live links, and
 * also whenever `status` is not "ready" so a partial read can never widen the
 * link past the budget's amount.
 *
 * Reads the raw link tables, so a link to a soft-deleted category or tag is
 * dropped here by checking it against the live *_with_usage views, the same
 * way the budget view's SQL ignores it.
 */
export const useBudgetTransactionsLink = ({
  enabled = true,
}: {
  /** Skip the reads when there is nothing to link, e.g. no budget cards. */
  enabled?: boolean;
} = {}) => {
  const all = {
    pagination: { mode: "off" as const },
    queryOptions: { enabled },
  };
  const links = {
    categories: useList({ resource: "budget_categories", ...all }),
    tags: useList({ resource: "budget_tags", ...all }),
    liveCategories: useList({ resource: "categories_with_usage", ...all }),
    liveTags: useList({ resource: "tags_with_usage", ...all }),
    hierarchy: useList({ resource: "category_hierarchy", ...all }),
  };
  const queries = Object.values(links).map((l) => l.query);

  // PostgREST caps a response at max_rows (1000) without an error, while the
  // exact count still reports the real total. A capped read would silently
  // drop links, so treat it as a failure.
  const truncated = queries.some(
    (q) => q.data !== undefined && q.data.total > q.data.data.length
  );
  const failure = queries.find((q) => q.error)?.error ?? null;
  const status: BudgetLinkStatus =
    failure || truncated
      ? "error"
      : queries.some((q) => q.isLoading)
        ? "loading"
        : "ready";

  useEffect(() => {
    if (failure) {
      console.error("useBudgetTransactionsLink: query failed", failure);
    } else if (truncated) {
      console.error(
        "useBudgetTransactionsLink: a link table exceeded the row cap; links disabled"
      );
    }
  }, [failure, truncated]);

  const categoriesData = links.categories.query.data;
  const tagsData = links.tags.query.data;
  const liveCategoriesData = links.liveCategories.query.data;
  const liveTagsData = links.liveTags.query.data;
  const hierarchyData = links.hierarchy.query.data;

  const lookup = useMemo(() => {
    const rows = <T>(data?: { data: unknown[] }): T[] =>
      (data?.data ?? []) as T[];

    const liveCategories = new Set(
      rows<{ id: string | null }>(liveCategoriesData).map((r) => r.id)
    );
    const liveTags = new Set(
      rows<{ id: string | null }>(liveTagsData).map((r) => r.id)
    );

    const descendantsOf = new Map<string, string[]>();
    for (const h of rows<{ ancestor_id: string; descendant_id: string }>(
      hierarchyData
    )) {
      const list = descendantsOf.get(h.ancestor_id) ?? [];
      list.push(h.descendant_id);
      descendantsOf.set(h.ancestor_id, list);
    }

    return {
      descendantsOf,
      categoriesByBudget: groupLiveLinks(
        rows<{ budget_id: string; category_id: string }>(categoriesData),
        "category_id",
        liveCategories
      ),
      tagsByBudget: groupLiveLinks(
        rows<{ budget_id: string; tag_id: string }>(tagsData),
        "tag_id",
        liveTags
      ),
    };
  }, [
    categoriesData,
    tagsData,
    liveCategoriesData,
    liveTagsData,
    hierarchyData,
  ]);

  const pathFor = (budget: LinkableBudget): string | null =>
    status !== "ready"
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

  return { pathFor, status };
};

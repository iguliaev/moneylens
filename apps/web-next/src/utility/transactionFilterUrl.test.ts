import { describe, expect, it } from "vitest";
import { parseTableParams, type CrudFilter } from "@refinedev/core";
import {
  budgetTransactionsPath,
  buildTransactionFilters,
  type BudgetLinkSource,
} from "./transactionFilterUrl";

const budget = (over: Partial<BudgetLinkSource> = {}): BudgetLinkSource => ({
  type: "spend",
  startDate: null,
  endDate: null,
  categoryIds: [],
  tagIds: [],
  ...over,
});

// Reads the path back with refine's own parser, the one syncWithLocation uses.
const filtersOf = (path: string): CrudFilter[] =>
  parseTableParams(path.split("?")[1]).parsedFilters;

const fieldOf = (f: CrudFilter) => ("field" in f ? f.field : undefined);
const keyOf = (f: CrudFilter) => ("key" in f ? f.key : undefined);

describe("buildTransactionFilters", () => {
  it("always carries the type", () => {
    expect(buildTransactionFilters({ type: "earn" })).toEqual([
      { field: "type", operator: "eq", value: "earn" },
    ]);
  });

  it("uses between when both dates are set", () => {
    const f = buildTransactionFilters({
      type: "spend",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(f).toContainEqual({
      field: "date",
      operator: "between",
      value: ["2026-01-01", "2026-12-31"],
    });
  });

  it("uses gte / lte for an open-ended range", () => {
    expect(
      buildTransactionFilters({ type: "spend", startDate: "2026-01-01" })
    ).toContainEqual({ field: "date", operator: "gte", value: "2026-01-01" });
    expect(
      buildTransactionFilters({ type: "spend", endDate: "2026-12-31" })
    ).toContainEqual({ field: "date", operator: "lte", value: "2026-12-31" });
  });

  it("emits one tag_ids_or conditional filter with an ina per tag", () => {
    const f = buildTransactionFilters({ type: "spend", tagIds: ["t1", "t2"] });
    expect(f).toContainEqual({
      key: "tag_ids_or",
      operator: "or",
      value: [
        { field: "tag_ids", operator: "ina", value: ["t1"] },
        { field: "tag_ids", operator: "ina", value: ["t2"] },
      ],
    });
  });
});

describe("budgetTransactionsPath", () => {
  it("returns null when the budget has no live links", () => {
    expect(budgetTransactionsPath(budget(), new Map())).toBeNull();
  });

  it("expands a linked parent to itself and its descendants, without duplicates", () => {
    const descendants = new Map([
      ["parent", ["parent", "child1", "child2"]],
      ["child1", ["child1"]],
    ]);
    const path = budgetTransactionsPath(
      budget({ categoryIds: ["parent", "child1"] }),
      descendants
    )!;
    const category = filtersOf(path).find((f) => fieldOf(f) === "category_id");
    expect(category?.operator).toBe("in");
    expect(category?.value).toEqual(["parent", "child1", "child2"]);
  });

  it("keeps a linked category that has no hierarchy row", () => {
    const path = budgetTransactionsPath(
      budget({ categoryIds: ["lonely"] }),
      new Map()
    )!;
    expect(
      filtersOf(path).find((f) => fieldOf(f) === "category_id")?.value
    ).toEqual(["lonely"]);
  });

  it("omits the category filter for a tag-only budget, and vice versa", () => {
    const tagOnly = budgetTransactionsPath(
      budget({ tagIds: ["t"] }),
      new Map()
    )!;
    expect(filtersOf(tagOnly).some((f) => fieldOf(f) === "category_id")).toBe(
      false
    );
    const catOnly = budgetTransactionsPath(
      budget({ categoryIds: ["c"] }),
      new Map()
    )!;
    expect(filtersOf(catOnly).some((f) => keyOf(f) === "tag_ids_or")).toBe(
      false
    );
  });

  it("targets the transactions page", () => {
    expect(
      budgetTransactionsPath(budget({ tagIds: ["t"] }), new Map())
    ).toMatch(/^\/transactions\?/);
  });
});

import { describe, expect, it } from "vitest";
import { parseTableParams, type CrudFilter } from "@refinedev/core";
import {
  breakdownRowKey,
  breakdownRowPath,
  buildMonthlySeries,
  coversPartialMonths,
  isValidBreakdownRange,
  type BreakdownRow,
} from "./breakdown";

const row = (over: Partial<BreakdownRow> = {}): BreakdownRow => ({
  entityId: "e1",
  name: "Name",
  parentName: null,
  memberIds: null,
  total: 10,
  txCount: 1,
  ...over,
});

const filtersOf = (path: string): CrudFilter[] =>
  parseTableParams(path.slice(path.indexOf("?"))).parsedFilters;
const fieldOf = (f: CrudFilter) => ("field" in f ? f.field : undefined);

describe("buildMonthlySeries", () => {
  it("zero-fills months with no row, from the start month to the end month inclusive", () => {
    const series = buildMonthlySeries(
      [{ month: "2026-02-01", total: 20, tx_count: 2 }],
      "2026-01-15",
      "2026-03-10"
    );
    expect(series).toEqual([
      { monthKey: "2026-01", total: 0, txCount: 0 },
      { monthKey: "2026-02", total: 20, txCount: 2 },
      { monthKey: "2026-03", total: 0, txCount: 0 },
    ]);
  });

  it("returns a single month when the period sits inside one month", () => {
    expect(
      buildMonthlySeries([], "2026-05-03", "2026-05-20").map((p) => p.monthKey)
    ).toEqual(["2026-05"]);
  });

  it("crosses a year boundary", () => {
    expect(
      buildMonthlySeries([], "2025-11-01", "2026-02-28").map((p) => p.monthKey)
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("is not thrown by numeric strings from the database", () => {
    const [point] = buildMonthlySeries(
      [
        {
          month: "2026-01-01",
          total: "12.5" as unknown as number,
          tx_count: 3,
        },
      ],
      "2026-01-01",
      "2026-01-31"
    );
    expect(point.total).toBe(12.5);
  });
});

describe("coversPartialMonths", () => {
  it("is false for whole calendar months", () => {
    expect(coversPartialMonths("2026-01-01", "2026-03-31")).toBe(false);
  });
  it("is true when the start is mid-month or the end is mid-month", () => {
    expect(coversPartialMonths("2026-01-02", "2026-03-31")).toBe(true);
    expect(coversPartialMonths("2026-01-01", "2026-03-30")).toBe(true);
  });
});

describe("isValidBreakdownRange", () => {
  it("accepts equal dates and rejects an inverted or empty range", () => {
    expect(isValidBreakdownRange("2026-01-01", "2026-01-01")).toBe(true);
    expect(isValidBreakdownRange("2026-02-01", "2026-01-01")).toBe(false);
    expect(isValidBreakdownRange("", "2026-01-01")).toBe(false);
  });
});

describe("breakdownRowKey", () => {
  it("gives the no-entity row a stable key", () => {
    expect(breakdownRowKey(row({ entityId: null }))).toBe("__none__");
    expect(breakdownRowKey(row({ entityId: "x" }))).toBe("x");
  });
});

describe("breakdownRowPath", () => {
  it("has no link for the Uncategorised / No account row", () => {
    expect(
      breakdownRowPath(
        "category",
        "spend",
        "2026-01-01",
        "2026-02-01",
        row({ entityId: null })
      )
    ).toBeNull();
  });

  it("filters a category row by its member ids, with type and period", () => {
    const path = breakdownRowPath(
      "category",
      "spend",
      "2026-01-01",
      "2026-02-28",
      row({ memberIds: ["p", "c1", "c2"] })
    )!;
    const filters = filtersOf(path);
    expect(path).toMatch(/^\/transactions\?/);
    expect(filters).toContainEqual({
      field: "type",
      operator: "eq",
      value: "spend",
    });
    expect(filters).toContainEqual({
      field: "date",
      operator: "between",
      value: ["2026-01-01", "2026-02-28"],
    });
    expect(filters.find((f) => fieldOf(f) === "category_id")).toMatchObject({
      operator: "in",
      value: ["p", "c1", "c2"],
    });
  });

  it("falls back to the entity id when a category row has no member ids", () => {
    const path = breakdownRowPath(
      "category",
      "earn",
      "2026-01-01",
      "2026-02-01",
      row()
    )!;
    expect(
      filtersOf(path).find((f) => fieldOf(f) === "category_id")
    ).toMatchObject({
      value: ["e1"],
    });
  });

  it("filters a tag row with the tag_ids_or filter", () => {
    const path = breakdownRowPath(
      "tag",
      "spend",
      "2026-01-01",
      "2026-02-01",
      row()
    )!;
    expect(filtersOf(path)).toContainEqual({
      key: "tag_ids_or",
      operator: "or",
      value: [{ field: "tag_ids", operator: "ina", value: ["e1"] }],
    });
  });

  it("filters a bank account row by bank_account_id", () => {
    const path = breakdownRowPath(
      "bank_account",
      "save",
      "2026-01-01",
      "2026-02-01",
      row()
    )!;
    expect(
      filtersOf(path).find((f) => fieldOf(f) === "bank_account_id")
    ).toMatchObject({
      operator: "in",
      value: ["e1"],
    });
  });
});

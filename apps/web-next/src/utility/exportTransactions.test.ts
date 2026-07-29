import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTransactionsForExport,
  MAX_EXPORT_ROWS,
} from "./exportTransactions";

function createSupabaseMock({
  count,
  pages,
}: {
  count: number;
  pages: unknown[][];
}) {
  let rangeCall = -1;
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => {
    rangeCall += 1;
    const data = pages[rangeCall] ?? [];
    return Promise.resolve({ data, error: null, count });
  });
  // head:true count-only call resolves directly on `.lte()`'s promise-like chain
  (chain as { then: PromiseLike<unknown>["then"] }).then = (resolve) =>
    Promise.resolve({ data: null, error: null, count }).then(resolve);

  const from = vi.fn(() => chain);
  return { from } as unknown as SupabaseClient;
}

describe("fetchTransactionsForExport", () => {
  it("rejects when the count exceeds MAX_EXPORT_ROWS", async () => {
    const client = createSupabaseMock({ count: MAX_EXPORT_ROWS + 1, pages: [] });
    const result = await fetchTransactionsForExport(
      "2026-01-01",
      "2026-12-31",
      client
    );
    expect(result).toEqual({
      ok: false,
      reason: "too_many_rows",
      count: MAX_EXPORT_ROWS + 1,
    });
  });

  it("paginates across multiple pages up to the returned count", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 500 }, (_, i) => ({ id: 1000 + i }));
    const client = createSupabaseMock({ count: 1500, pages: [page1, page2] });
    const result = await fetchTransactionsForExport(
      "2026-01-01",
      "2026-12-31",
      client
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(1500);
  });

  it("returns an empty result when there are no transactions in range", async () => {
    const client = createSupabaseMock({ count: 0, pages: [] });
    const result = await fetchTransactionsForExport(
      "2026-01-01",
      "2026-12-31",
      client
    );
    expect(result).toEqual({ ok: true, rows: [] });
  });
});

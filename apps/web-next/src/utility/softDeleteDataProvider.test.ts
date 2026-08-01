import { describe, expect, it, vi } from "vitest";
import type { DataProvider } from "@refinedev/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withSoftDelete } from "./softDeleteDataProvider";

type QueryResult = { data: unknown; error: unknown };

function createSupabaseMock(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  // `deleteOne` awaits `.single()` directly (a real promise, not the builder).
  chain.single = vi.fn(async () => result);
  // `deleteMany` awaits the builder itself after `.select()` — supabase-js's
  // query builder is thenable, so mimic that instead of adding a fake await point.
  (chain as { then: PromiseLike<QueryResult>["then"] }).then = (resolve) =>
    Promise.resolve(result).then(resolve);

  const from = vi.fn(() => chain);
  const supabaseClient = { from } as unknown as SupabaseClient;
  return { supabaseClient, chain, from };
}

function createBaseProviderMock() {
  return {
    deleteOne: vi.fn(async () => ({ data: { id: "base-deleteOne" } })),
    deleteMany: vi.fn(async () => ({ data: [{ id: "base-deleteMany" }] })),
  } as unknown as DataProvider;
}

describe("withSoftDelete", () => {
  describe("deleteOne", () => {
    it("soft-deletes a supported resource by setting deleted_at instead of hard-deleting", async () => {
      const record = { id: "1", deleted_at: "2026-07-19T00:00:00.000Z" };
      const { supabaseClient, chain, from } = createSupabaseMock({
        data: record,
        error: null,
      });
      const baseProvider = createBaseProviderMock();
      const provider = withSoftDelete(baseProvider, supabaseClient);

      const result = await provider.deleteOne({
        resource: "transactions",
        id: "1",
      });

      expect(from).toHaveBeenCalledWith("transactions");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      );
      expect(chain.eq).toHaveBeenCalledWith("id", "1");
      expect(baseProvider.deleteOne).not.toHaveBeenCalled();
      expect(result).toEqual({ data: record });
    });

    it("delegates to the base provider for resources without soft delete", async () => {
      const { supabaseClient, from } = createSupabaseMock({
        data: null,
        error: null,
      });
      const baseProvider = createBaseProviderMock();
      const provider = withSoftDelete(baseProvider, supabaseClient);

      const result = await provider.deleteOne({
        resource: "user_settings",
        id: "1",
      });

      expect(from).not.toHaveBeenCalled();
      expect(baseProvider.deleteOne).toHaveBeenCalledWith({
        resource: "user_settings",
        id: "1",
        meta: undefined,
      });
      expect(result).toEqual({ data: { id: "base-deleteOne" } });
    });

    it("rejects when the update fails", async () => {
      const dbError = new Error("update failed");
      const { supabaseClient } = createSupabaseMock({
        data: null,
        error: dbError,
      });
      const provider = withSoftDelete(createBaseProviderMock(), supabaseClient);

      await expect(
        provider.deleteOne({ resource: "tags", id: "1" })
      ).rejects.toBe(dbError);
    });
  });

  describe("deleteMany", () => {
    it("soft-deletes all ids of a supported resource instead of hard-deleting", async () => {
      const records = [
        { id: "1", deleted_at: "2026-07-19T00:00:00.000Z" },
        { id: "2", deleted_at: "2026-07-19T00:00:00.000Z" },
      ];
      const { supabaseClient, chain, from } = createSupabaseMock({
        data: records,
        error: null,
      });
      const baseProvider = createBaseProviderMock();
      const provider = withSoftDelete(baseProvider, supabaseClient);

      const result = await provider.deleteMany!({
        resource: "tags",
        ids: ["1", "2"],
      });

      expect(from).toHaveBeenCalledWith("tags");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      );
      expect(chain.in).toHaveBeenCalledWith("id", ["1", "2"]);
      expect(baseProvider.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ data: records });
    });

    it("falls back to an empty array when the update returns no rows", async () => {
      const { supabaseClient } = createSupabaseMock({ data: null, error: null });
      const provider = withSoftDelete(createBaseProviderMock(), supabaseClient);

      const result = await provider.deleteMany!({
        resource: "budgets",
        ids: ["1"],
      });

      expect(result).toEqual({ data: [] });
    });

    it("delegates to the base provider for resources without soft delete", async () => {
      const { supabaseClient, from } = createSupabaseMock({
        data: null,
        error: null,
      });
      const baseProvider = createBaseProviderMock();
      const provider = withSoftDelete(baseProvider, supabaseClient);

      const result = await provider.deleteMany!({
        resource: "user_settings",
        ids: ["1", "2"],
      });

      expect(from).not.toHaveBeenCalled();
      expect(baseProvider.deleteMany).toHaveBeenCalledWith({
        resource: "user_settings",
        ids: ["1", "2"],
        meta: undefined,
      });
      expect(result).toEqual({ data: [{ id: "base-deleteMany" }] });
    });

    it("rejects when the update fails", async () => {
      const dbError = new Error("update failed");
      const { supabaseClient } = createSupabaseMock({
        data: null,
        error: dbError,
      });
      const provider = withSoftDelete(createBaseProviderMock(), supabaseClient);

      await expect(
        provider.deleteMany!({ resource: "categories", ids: ["1"] })
      ).rejects.toBe(dbError);
    });
  });
});

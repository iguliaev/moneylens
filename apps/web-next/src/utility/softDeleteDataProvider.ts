import type { DataProvider } from "@refinedev/core";
import type { SupabaseClient } from "@supabase/supabase-js";

// Resources that support soft delete (use deleted_at instead of hard DELETE)
const SOFT_DELETE_RESOURCES = new Set([
  "transactions",
  "categories",
  "bank_accounts",
  "tags",
  "budgets",
]);

/**
 * Wraps a Refine data provider so that deleteOne for soft-deletable resources
 * sets deleted_at = NOW() instead of issuing a SQL DELETE.
 */
export function withSoftDelete(
  provider: DataProvider,
  supabaseClient: SupabaseClient
): DataProvider {
  return {
    ...provider,
    deleteOne: async ({ resource, id, meta }) => {
      if (!SOFT_DELETE_RESOURCES.has(resource)) {
        return provider.deleteOne({ resource, id, meta });
      }

      const { data, error } = await supabaseClient
        .from(resource)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return Promise.reject(error);
      }

      return { data };
    },
  };
}

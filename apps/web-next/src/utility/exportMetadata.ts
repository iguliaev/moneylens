import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { supabaseClient } from "./supabaseClient";

export interface CategoryExportRecord {
  type: Database["public"]["Enums"]["transaction_type"];
  name: string;
  description: string | null;
  parent_name: string | null;
}

export interface BankAccountExportRecord {
  name: string;
  description: string | null;
}

export interface TagExportRecord {
  name: string;
  description: string | null;
}

export interface ExportMetadata {
  categories: CategoryExportRecord[];
  bank_accounts: BankAccountExportRecord[];
  tags: TagExportRecord[];
}

export type ExportMetadataFetchResult =
  | ({ ok: true } & ExportMetadata)
  | { ok: false; message: string };

// Views already scope rows to the current user via RLS (security_invoker) and
// exclude soft-deleted records, so no extra filtering is needed here.
export const fetchExportMetadata = async (
  client: SupabaseClient = supabaseClient
): Promise<ExportMetadataFetchResult> => {
  const [categoriesRes, bankAccountsRes, tagsRes] = await Promise.all([
    client
      .from("categories_with_usage")
      .select("type, name, description, parent_name"),
    client.from("bank_accounts_with_usage").select("name, description"),
    client.from("tags_with_usage").select("name, description"),
  ]);

  const error = categoriesRes.error ?? bankAccountsRes.error ?? tagsRes.error;
  if (error) return { ok: false, message: error.message };

  return {
    ok: true,
    // Columns are nullable at the view-type level only because it's a view;
    // RLS guarantees these belong to the current user and name/type are
    // NOT NULL on the underlying tables, so filtering here is just a type guard.
    categories: (categoriesRes.data ?? []).filter(
      (row): row is CategoryExportRecord => row.name !== null && row.type !== null
    ),
    bank_accounts: (bankAccountsRes.data ?? []).filter(
      (row): row is BankAccountExportRecord => row.name !== null
    ),
    tags: (tagsRes.data ?? []).filter((row): row is TagExportRecord => row.name !== null),
  };
};

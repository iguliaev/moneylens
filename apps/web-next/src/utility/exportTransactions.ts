import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { supabaseClient } from "./supabaseClient";

export const MAX_EXPORT_ROWS = 10_000;
const PAGE_SIZE = 1000; // matches PostgREST max_rows (supabase/config.toml)

export interface TransactionExportRow {
  date: string;
  type: Database["public"]["Enums"]["transaction_type"];
  category_name: string | null;
  category_parent_name: string | null;
  bank_account_name: string | null;
  amount: number;
  tag_names: string[];
  notes: string | null;
}

export type ExportFetchResult =
  | { ok: true; rows: TransactionExportRow[] }
  | { ok: false; reason: "too_many_rows"; count: number }
  | { ok: false; reason: "error"; message: string };

export const countTransactionsInRange = async (
  client: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<number> => {
  const { count, error } = await client
    .from("transactions_with_details")
    .select("id", { count: "exact", head: true })
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export const fetchTransactionsForExport = async (
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabaseClient
): Promise<ExportFetchResult> => {
  try {
    const count = await countTransactionsInRange(client, startDate, endDate);
    if (count > MAX_EXPORT_ROWS) {
      return { ok: false, reason: "too_many_rows", count };
    }
    if (count === 0) return { ok: true, rows: [] };

    const rows: TransactionExportRow[] = [];
    for (let from = 0; from < count; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE, count) - 1;
      const { data, error } = await client
        .from("transactions_with_details")
        .select(
          "date, type, category_name, category_parent_name, bank_account_name, amount, tag_names, notes"
        )
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .range(from, to);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as TransactionExportRow[]));
    }
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Export failed",
    };
  }
};

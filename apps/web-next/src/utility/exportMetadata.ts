import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { supabaseClient } from "./supabaseClient";
import { formatCategoryPath } from "./csvExport";

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

export interface BudgetExportRecord {
  name: string;
  type: Database["public"]["Enums"]["transaction_type"];
  target_amount: number;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  // "Parent/Child" path (nested) or bare name (root leaf), same convention
  // as a transaction's own category — resolved from budget_categories.
  categories: string[];
  tags: string[];
}

export interface ExportMetadata {
  categories: CategoryExportRecord[];
  bank_accounts: BankAccountExportRecord[];
  tags: TagExportRecord[];
  budgets: BudgetExportRecord[];
}

export type ExportMetadataFetchResult =
  | ({ ok: true } & ExportMetadata)
  | { ok: false; message: string };

// Views already scope rows to the current user via RLS (security_invoker) and
// exclude soft-deleted records, so no extra filtering is needed here.
// budget_categories/budget_tags are the raw junction tables (not views), so
// a link to a soft-deleted category/tag can still come back — those are
// dropped below by only resolving against the live id maps built from
// categories_with_usage/tags_with_usage.
export const fetchExportMetadata = async (
  client: SupabaseClient = supabaseClient
): Promise<ExportMetadataFetchResult> => {
  const [categoriesRes, bankAccountsRes, tagsRes, budgetsRes, budgetCategoriesRes, budgetTagsRes] =
    await Promise.all([
      client
        .from("categories_with_usage")
        .select("id, type, name, description, parent_name"),
      client.from("bank_accounts_with_usage").select("name, description"),
      client.from("tags_with_usage").select("id, name, description"),
      client
        .from("budgets_with_linked")
        .select("id, name, description, type, target_amount, start_date, end_date"),
      client.from("budget_categories").select("budget_id, category_id"),
      client.from("budget_tags").select("budget_id, tag_id"),
    ]);

  const error =
    categoriesRes.error ??
    bankAccountsRes.error ??
    tagsRes.error ??
    budgetsRes.error ??
    budgetCategoriesRes.error ??
    budgetTagsRes.error;
  if (error) return { ok: false, message: error.message };

  // Columns are nullable at the view-type level only because it's a view;
  // RLS guarantees these belong to the current user and name/type are
  // NOT NULL on the underlying tables, so filtering here is just a type guard.
  const categoriesRaw = (categoriesRes.data ?? []).filter(
    (
      row
    ): row is {
      id: string;
      type: Database["public"]["Enums"]["transaction_type"];
      name: string;
      description: string | null;
      parent_name: string | null;
    } => row.id !== null && row.name !== null && row.type !== null
  );
  const categoryById = new Map(
    categoriesRaw.map((row) => [row.id, { name: row.name, parent_name: row.parent_name }])
  );

  const tagsRaw = (tagsRes.data ?? []).filter(
    (row): row is { id: string; name: string; description: string | null } =>
      row.id !== null && row.name !== null
  );
  const tagNameById = new Map(tagsRaw.map((row) => [row.id, row.name]));

  const budgetCategoryPaths = new Map<string, string[]>();
  for (const link of budgetCategoriesRes.data ?? []) {
    if (!link.budget_id || !link.category_id) continue;
    const category = categoryById.get(link.category_id);
    if (!category) continue; // soft-deleted or otherwise no longer live — drop the link
    const path = formatCategoryPath(category.name, category.parent_name);
    const paths = budgetCategoryPaths.get(link.budget_id) ?? [];
    paths.push(path);
    budgetCategoryPaths.set(link.budget_id, paths);
  }

  const budgetTagNames = new Map<string, string[]>();
  for (const link of budgetTagsRes.data ?? []) {
    if (!link.budget_id || !link.tag_id) continue;
    const name = tagNameById.get(link.tag_id);
    if (!name) continue; // soft-deleted or otherwise no longer live — drop the link
    const names = budgetTagNames.get(link.budget_id) ?? [];
    names.push(name);
    budgetTagNames.set(link.budget_id, names);
  }

  return {
    ok: true,
    categories: categoriesRaw.map(({ name, type, description, parent_name }) => ({
      name,
      type,
      description,
      parent_name,
    })),
    bank_accounts: (bankAccountsRes.data ?? []).filter(
      (row): row is BankAccountExportRecord => row.name !== null
    ),
    tags: tagsRaw.map(({ name, description }) => ({ name, description })),
    budgets: (budgetsRes.data ?? [])
      .filter(
        (
          row
        ): row is {
          id: string;
          name: string;
          description: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          target_amount: number;
          start_date: string | null;
          end_date: string | null;
        } =>
          row.id !== null &&
          row.name !== null &&
          row.type !== null &&
          row.target_amount !== null
      )
      .map((row) => ({
        name: row.name,
        type: row.type,
        target_amount: row.target_amount,
        description: row.description,
        start_date: row.start_date,
        end_date: row.end_date,
        categories: (budgetCategoryPaths.get(row.id) ?? []).sort(),
        tags: (budgetTagNames.get(row.id) ?? []).sort(),
      })),
  };
};

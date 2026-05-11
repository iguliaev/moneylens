import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "../types/database.types";
import { supabaseClient } from "./supabaseClient";

interface CategoryInput {
  type: Database["public"]["Enums"]["transaction_type"];
  name: string;
  description?: string | null;
}

interface BankAccountInput {
  name: string;
  description?: string | null;
}

interface TagInput {
  name: string;
  description?: string | null;
}

interface BulkTransactionInput {
  date: string;
  type: Database["public"]["Enums"]["transaction_type"];
  amount: number;
  category?: string | null;
  bank_account?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

export interface BulkUploadPayload {
  categories?: CategoryInput[];
  bank_accounts?: BankAccountInput[];
  tags?: TagInput[];
  transactions?: BulkTransactionInput[];
}

export interface BulkUploadResult {
  success: boolean;
  error?: string;
  categories_inserted?: number;
  bank_accounts_inserted?: number;
  tags_inserted?: number;
  transactions_inserted?: number;
}

export interface DataResetResult {
  success: boolean;
  budgets_deleted?: number;
  transactions_deleted: number;
  categories_deleted: number;
  tags_deleted: number;
  bank_accounts_deleted: number;
}

export interface TransactionWithTagsInput {
  date: string;
  type: Database["public"]["Enums"]["transaction_type"];
  amount: number;
  category_id: string;
  bank_account_id: string;
  notes?: string;
}

type RpcResponse<T> = Promise<PostgrestSingleResponse<T>>;
type JsonObject = { [key: string]: Json | undefined };
type TransactionRow = Tables<"transactions">;

// INTENTIONAL_DIRECT_SUPABASE: RPC must run via Supabase client, wrapped here for typed call sites.
export const bulkUploadData = async (
  payload: BulkUploadPayload
): RpcResponse<BulkUploadResult> =>
  await supabaseClient.rpc("bulk_upload_data", {
    p_payload: payload as JsonObject,
  });

// INTENTIONAL_DIRECT_SUPABASE: RPC must run via Supabase client, wrapped here for typed call sites.
export const resetUserData = async (): RpcResponse<DataResetResult> =>
  await supabaseClient.rpc("reset_user_data");

// INTENTIONAL_DIRECT_SUPABASE: RPC must run via Supabase client, wrapped here for typed call sites.
export const createTransactionWithTags = async (
  transaction: TransactionWithTagsInput,
  tagIds: string[]
): RpcResponse<TransactionRow> => {
  const transactionPayload: JsonObject = { ...transaction };
  return await supabaseClient.rpc("create_transaction_with_tags", {
    p_transaction: transactionPayload,
    p_tag_ids: tagIds,
  });
};

// INTENTIONAL_DIRECT_SUPABASE: RPC must run via Supabase client, wrapped here for typed call sites.
export const updateTransactionWithTags = async (
  transactionId: string,
  transaction: TransactionWithTagsInput,
  tagIds: string[]
): RpcResponse<TransactionRow> => {
  const transactionPayload: JsonObject = { ...transaction };
  return await supabaseClient.rpc("update_transaction_with_tags", {
    p_transaction_id: transactionId,
    p_transaction: transactionPayload,
    p_tag_ids: tagIds,
  });
};

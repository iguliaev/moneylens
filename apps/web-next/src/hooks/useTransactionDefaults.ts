import { useCallback, useMemo } from "react";
import { useInvalidate, useList, useNotification } from "@refinedev/core";
import {
  TRANSACTION_TYPES,
  type TransactionType,
} from "../constants/transactionTypes";
import type { Database } from "../types/database.types";
import { supabaseClient } from "../utility";

type DefaultsRow =
  Database["public"]["Tables"]["user_transaction_defaults"]["Row"];
type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

export interface TransactionTypeDefaults {
  categoryId: string | null;
  bankAccountId: string | null;
}

export type TransactionDefaultsByType = Record<
  TransactionType,
  TransactionTypeDefaults
>;

const EMPTY_DEFAULTS: TransactionTypeDefaults = {
  categoryId: null,
  bankAccountId: null,
};

function emptyDefaultsByType(): TransactionDefaultsByType {
  return Object.values(TRANSACTION_TYPES).reduce((acc, type) => {
    acc[type] = EMPTY_DEFAULTS;
    return acc;
  }, {} as TransactionDefaultsByType);
}

/**
 * Reads and writes the user's transaction entry defaults: a category and bank
 * account per transaction type, plus the type the Create form should open on.
 *
 * Writes go straight through supabaseClient rather than Refine mutations —
 * user_transaction_defaults is keyed on the composite (user_id, type) and has no
 * `id` column, which Refine's Supabase provider assumes. user_id is omitted from
 * the payload deliberately: the set_user_id trigger fills it in server-side.
 */
export function useTransactionDefaults() {
  const { open: openNotification } = useNotification();
  const invalidate = useInvalidate();

  const { result: defaultsResult, query: defaultsQuery } =
    useList<DefaultsRow>({
      resource: "user_transaction_defaults",
      pagination: { mode: "off" },
    });

  const { result: settingsResult, query: settingsQuery } =
    useList<UserSettingsRow>({
      resource: "user_settings",
      pagination: { mode: "off" },
    });

  const defaultsByType = useMemo(() => {
    const byType = emptyDefaultsByType();
    for (const row of defaultsResult?.data ?? []) {
      byType[row.type] = {
        categoryId: row.category_id,
        bankAccountId: row.bank_account_id,
      };
    }
    return byType;
  }, [defaultsResult?.data]);

  const defaultType = settingsResult?.data?.[0]?.default_transaction_type ?? null;

  const notifyFailure = useCallback(
    (message: string, description: string) => {
      openNotification?.({ type: "error", message, description });
    },
    [openNotification]
  );

  const setDefaultsForType = useCallback(
    async (type: TransactionType, next: TransactionTypeDefaults) => {
      const { error } = await supabaseClient
        .from("user_transaction_defaults")
        .upsert(
          {
            type,
            category_id: next.categoryId,
            bank_account_id: next.bankAccountId,
          },
          { onConflict: "user_id,type" }
        );

      if (error) {
        notifyFailure(
          "Failed to save transaction defaults",
          error.message
        );
        return;
      }

      await invalidate({
        resource: "user_transaction_defaults",
        invalidates: ["list"],
      });
    },
    [invalidate, notifyFailure]
  );

  const setDefaultType = useCallback(
    async (type: TransactionType | null) => {
      const { error } = await supabaseClient
        .from("user_settings")
        .upsert(
          { default_transaction_type: type },
          { onConflict: "user_id" }
        );

      if (error) {
        notifyFailure("Failed to save default type", error.message);
        return;
      }

      await invalidate({ resource: "user_settings", invalidates: ["list"] });
    },
    [invalidate, notifyFailure]
  );

  return {
    defaultsByType,
    defaultType,
    isLoading: defaultsQuery.isLoading || settingsQuery.isLoading,
    setDefaultsForType,
    setDefaultType,
  };
}

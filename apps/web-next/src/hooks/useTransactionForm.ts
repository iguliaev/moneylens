import { useState } from "react";
import { useNavigate } from "react-router";
import { useInvalidate, useNotification } from "@refinedev/core";
import type { Dayjs } from "dayjs";
import type { Database } from "../types/database.types";
import {
  createTransactionWithTags,
  updateTransactionWithTags,
  type TransactionWithTagsInput,
} from "../utility";

type Mode = "create" | "edit";

interface UseTransactionFormOptions {
  mode: Mode;
  id?: string | undefined;
}

export interface TransactionFormValues {
  date: string | Dayjs;
  type: Database["public"]["Enums"]["transaction_type"];
  amount: number;
  category_id: string;
  bank_account_id: string;
  notes?: string;
  tag_ids?: string[];
}

export function useTransactionForm({ mode, id }: UseTransactionFormOptions) {
  const { open: openNotification } = useNotification();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  async function handleFinish(values: unknown) {
    const formValues = values as TransactionFormValues;
    setIsLoading(true);

    let saved = false;
    try {
      const { tag_ids, ...rawFields } = formValues;
      const tagIds: string[] = tag_ids ?? [];

      // DatePicker returns a dayjs object — serialize to YYYY-MM-DD for the RPC
      const transactionFields = {
        ...rawFields,
        date:
          rawFields.date &&
          typeof (rawFields.date as Dayjs).format === "function"
            ? (rawFields.date as Dayjs).format("YYYY-MM-DD")
            : String(rawFields.date),
      } satisfies TransactionWithTagsInput;

      let result;
      if (mode === "create") {
        result = await createTransactionWithTags(transactionFields, tagIds);
      } else {
        if (!id) throw new Error("id is required for edit mode");
        result = await updateTransactionWithTags(id, transactionFields, tagIds);
      }

      // result.data can be null if the RPC's UPDATE matched zero rows
      // (e.g. a concurrent delete) — treat that as a failure too, not a
      // silent no-op success.
      if (result.error || !result.data) {
        openNotification?.({
          type: "error",
          message: "Failed to save transaction",
          description: result.error?.message ?? "Transaction was not saved.",
        });
      } else {
        saved = true;
      }
    } catch (err) {
      openNotification?.({
        type: "error",
        message: "Failed to save transaction",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }

    setIsLoading(false);

    // Cache invalidation is best-effort and must never be reported as a
    // save failure — the RPC already committed by this point.
    if (saved) {
      try {
        await invalidate({ resource: "transactions", invalidates: ["list"] });
        await invalidate({
          resource: "transactions_with_details",
          invalidates: ["list"],
        });
      } catch {
        // ignore — navigation still proceeds below
      }
      navigate("/transactions");
    }
  }

  return { handleFinish, isLoading };
}

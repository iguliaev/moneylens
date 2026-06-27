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

      let error: { message: string } | null = null;

      if (mode === "create") {
        const result = await createTransactionWithTags(
          transactionFields,
          tagIds
        );
        error = result.error;
      } else {
        if (!id) throw new Error("id is required for edit mode");
        const result = await updateTransactionWithTags(
          id,
          transactionFields,
          tagIds
        );
        error = result.error;
      }

      if (error) {
        openNotification?.({
          type: "error",
          message: "Failed to save transaction",
          description: error.message,
        });
        setIsLoading(false);
        return;
      }

      await invalidate({
        resource: "transactions",
        invalidates: ["list"],
      });
      await invalidate({
        resource: "transactions_with_details",
        invalidates: ["list"],
      });
      setIsLoading(false);
      navigate("/transactions");
    } catch (err) {
      openNotification?.({
        type: "error",
        message: "Failed to save transaction",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsLoading(false);
    }
  }

  return { handleFinish, isLoading };
}

import { useState } from "react";
import { useInvalidate, useNavigation, useNotification } from "@refinedev/core";
import { supabaseClient } from "../utility";

type Mode = "create" | "edit";

interface UseTransactionFormOptions {
  mode: Mode;
  id?: string | undefined;
}

interface TransactionFormValues {
  date: string;
  type: string;
  amount: number;
  category_id: string;
  bank_account_id: string;
  notes?: string;
  tag_ids?: string[];
}

export function useTransactionForm({ mode, id }: UseTransactionFormOptions) {
  const { open: openNotification } = useNotification();
  const invalidate = useInvalidate();
  const { list } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  async function handleFinish(values: TransactionFormValues) {
    setIsLoading(true);
    try {
      const { tag_ids, ...transactionFields } = values;
      const tagIds: string[] = tag_ids ?? [];

      let error: { message: string } | null = null;

      if (mode === "create") {
        const result = await supabaseClient.rpc("create_transaction_with_tags", {
          p_transaction: transactionFields,
          p_tag_ids: tagIds,
        });
        error = result.error;
      } else {
        if (!id) throw new Error("id is required for edit mode");
        const result = await supabaseClient.rpc("update_transaction_with_tags", {
          p_transaction_id: id,
          p_transaction: transactionFields,
          p_tag_ids: tagIds,
        });
        error = result.error;
      }

      if (error) {
        openNotification?.({
          type: "error",
          message: "Failed to save transaction",
          description: error.message,
        });
        return;
      }

      await invalidate({ resource: "transactions", invalidates: ["list"] });
      list("transactions");
    } finally {
      setIsLoading(false);
    }
  }

  return { handleFinish, isLoading };
}

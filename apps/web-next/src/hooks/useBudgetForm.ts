import { useState } from "react";
import { useNavigate } from "react-router";
import { useInvalidate, useNotification } from "@refinedev/core";
import type { Dayjs } from "dayjs";
import type { Database } from "../types/database.types";
import {
  createBudgetWithLinks,
  updateBudgetWithLinks,
  type BudgetWithLinksInput,
} from "../utility";

type Mode = "create" | "edit";

interface UseBudgetFormOptions {
  mode: Mode;
  id?: string | undefined;
}

export interface BudgetFormValues {
  name: string;
  description?: string;
  type: Database["public"]["Enums"]["transaction_type"];
  target_amount: number;
  start_date?: string | Dayjs;
  end_date?: string | Dayjs;
  category_ids?: string[];
  tag_ids?: string[];
}

function toDateString(value: unknown): string | null {
  if (!value) return null;
  return typeof (value as Dayjs).format === "function"
    ? (value as Dayjs).format("YYYY-MM-DD")
    : String(value);
}

export function useBudgetForm({ mode, id }: UseBudgetFormOptions) {
  const { open: openNotification } = useNotification();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  async function handleFinish(values: unknown) {
    const formValues = values as BudgetFormValues;
    setIsLoading(true);
    try {
      const { category_ids, tag_ids, ...rawFields } = formValues;
      const categoryIds: string[] = category_ids ?? [];
      const tagIds: string[] = tag_ids ?? [];

      const budgetFields = {
        name: rawFields.name,
        description: rawFields.description ?? null,
        type: rawFields.type,
        target_amount: rawFields.target_amount,
        start_date: toDateString(rawFields.start_date),
        end_date: toDateString(rawFields.end_date),
      } satisfies BudgetWithLinksInput;

      let error: { message: string } | null = null;

      if (mode === "create") {
        const result = await createBudgetWithLinks(
          budgetFields,
          categoryIds,
          tagIds
        );
        error = result.error;
      } else {
        if (!id) throw new Error("id is required for edit mode");
        const result = await updateBudgetWithLinks(
          id,
          budgetFields,
          categoryIds,
          tagIds
        );
        error = result.error;
      }

      if (error) {
        openNotification?.({
          type: "error",
          message: "Failed to save budget",
          description: error.message,
        });
        setIsLoading(false);
        return;
      }

      await invalidate({
        resource: "budgets_with_linked",
        invalidates: ["list"],
      });
      setIsLoading(false);
      navigate("/budgets");
    } catch (err) {
      openNotification?.({
        type: "error",
        message: "Failed to save budget",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsLoading(false);
    }
  }

  return { handleFinish, isLoading };
}

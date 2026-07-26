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

    let saved = false;
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

      let result;
      if (mode === "create") {
        result = await createBudgetWithLinks(budgetFields, categoryIds, tagIds);
      } else {
        if (!id) throw new Error("id is required for edit mode");
        result = await updateBudgetWithLinks(
          id,
          budgetFields,
          categoryIds,
          tagIds
        );
      }

      // result.data can be null if the RPC's UPDATE matched zero rows
      // (e.g. a concurrent delete) — treat that as a failure too, not a
      // silent no-op success.
      if (result.error || !result.data) {
        openNotification?.({
          type: "error",
          message: "Failed to save budget",
          description: result.error?.message ?? "Budget was not saved.",
        });
      } else {
        saved = true;
      }
    } catch (err) {
      openNotification?.({
        type: "error",
        message: "Failed to save budget",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }

    setIsLoading(false);

    // Cache invalidation is best-effort and must never be reported as a
    // save failure — the RPC already committed by this point.
    if (saved) {
      try {
        await invalidate({
          resource: "budgets_with_linked",
          invalidates: ["list"],
        });
        await invalidate({
          resource: "budgets",
          invalidates: ["list", "detail"],
        });
      } catch {
        // ignore — navigation still proceeds below
      }
      navigate("/budgets");
    }
  }

  return { handleFinish, isLoading };
}

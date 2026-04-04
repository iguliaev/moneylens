import React, { useEffect, useState } from "react";
import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag, Progress } from "antd";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  TransactionType,
} from "../../constants/transactionTypes";
import { formatCurrency } from "../../utility/currency";
import { supabaseClient } from "../../utility";
import dayjs from "dayjs";

export const BudgetShow = () => {
  const { query, result: record } = useShow({
    resource: "budgets_with_linked",
  });
  const { isLoading } = query;

  const [currentAmount, setCurrentAmount] = useState<number>(0);

  useEffect(() => {
    if (!record?.id) return;
    supabaseClient.rpc("get_budget_progress").then(({ data }) => {
      if (data) {
        const match = (data as Array<{ id: string; current_amount: number }>).find(
          (b) => b.id === record.id
        );
        if (match) setCurrentAmount(Number(match.current_amount));
      }
    });
  }, [record?.id]);

  const type = record?.type as TransactionType | undefined;
  const targetAmount = Number(record?.target_amount ?? 0);
  const percent =
    targetAmount > 0
      ? Math.min(100, Math.round((currentAmount / targetAmount) * 100))
      : 0;

  return (
    <Show isLoading={isLoading}>
      <Descriptions
        column={1}
        layout="horizontal"
        colon
        labelStyle={{ fontWeight: 500, minWidth: 130, color: "inherit" }}
        style={{ marginBottom: 24 }}
      >
        <Descriptions.Item label="Name">
          {(record?.name as string) ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Description">
          {(record?.description as string) || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Type">
          {type && (
            <Tag color={TRANSACTION_TYPE_COLORS[type]}>
              {TRANSACTION_TYPE_LABELS[type]}
            </Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Target Amount">
          <strong>{formatCurrency(targetAmount)}</strong>
        </Descriptions.Item>
        <Descriptions.Item label="Start Date">
          {record?.start_date
            ? dayjs(record.start_date as string).format("DD MMM YYYY")
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="End Date">
          {record?.end_date
            ? dayjs(record.end_date as string).format("DD MMM YYYY")
            : "Ongoing"}
        </Descriptions.Item>
      </Descriptions>

      <div style={{ maxWidth: 520 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 13,
          }}
        >
          <span>Progress</span>
          <span>
            {formatCurrency(currentAmount)} of {formatCurrency(targetAmount)}
          </span>
        </div>
        <Progress
          percent={percent}
          status={
            percent >= 100
              ? type === "spend"
                ? "exception"
                : "success"
              : "normal"
          }
          strokeWidth={10}
        />
      </div>
    </Show>
  );
};

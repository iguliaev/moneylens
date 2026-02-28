import React from "react";
import { useShow } from "@refinedev/core";
import { Show, TextField, DateField, NumberField } from "@refinedev/antd";
import { Tag, Typography } from "antd";
import {
  TRANSACTION_TYPE_LABELS,
  TransactionType,
} from "../../constants/transactionTypes";

const { Title } = Typography;

const TYPE_COLORS: Record<TransactionType, string> = {
  earn: "green",
  spend: "red",
  save: "blue",
};

export const BudgetShow = () => {
  const { query, result: record } = useShow();
  const { isLoading } = query;

  const type = record?.type as TransactionType | undefined;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Name</Title>
      <TextField value={record?.name} />
      <Title level={5}>Description</Title>
      <TextField value={record?.description} />
      <Title level={5}>Type</Title>
      {type && (
        <Tag color={TYPE_COLORS[type]}>{TRANSACTION_TYPE_LABELS[type]}</Tag>
      )}
      <Title level={5}>Target Amount</Title>
      <NumberField
        value={record?.target_amount ?? 0}
        options={{ style: "currency", currency: "GBP" }}
      />
      <Title level={5}>Start Date</Title>
      <DateField value={record?.start_date} />
      <Title level={5}>End Date</Title>
      <DateField value={record?.end_date} />
    </Show>
  );
};

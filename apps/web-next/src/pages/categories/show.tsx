import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag } from "antd";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  TransactionType,
} from "../../constants/transactionTypes";

export const CategoryShow = () => {
  const { query, result: record } = useShow();
  const { isLoading } = query;

  const type = record?.type as TransactionType | undefined;

  return (
    <Show isLoading={isLoading}>
      <Descriptions
        column={1}
        layout="horizontal"
        colon
        labelStyle={{ fontWeight: 500, minWidth: 130, color: "inherit" }}
      >
        <Descriptions.Item label="Name">
          {(record?.name as string) ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Type">
          {type ? (
            <Tag color={TRANSACTION_TYPE_COLORS[type]}>
              {TRANSACTION_TYPE_LABELS[type]}
            </Tag>
          ) : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Description">
          {(record?.description as string) || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Created At">
          {record?.created_at
            ? dayjs(record.created_at as string).format("DD MMM YYYY")
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Updated At">
          {record?.updated_at
            ? dayjs(record.updated_at as string).format("DD MMM YYYY")
            : "—"}
        </Descriptions.Item>
      </Descriptions>
    </Show>
  );
};

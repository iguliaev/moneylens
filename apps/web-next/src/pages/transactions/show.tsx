import { useShow, useOne, useMany } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions, Tag } from "antd";
import { formatCurrency } from "../../utility";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  TRANSACTION_TYPE_HEX,
  TransactionType,
} from "../../constants/transactionTypes";
import dayjs from "dayjs";

export const TransactionShow = () => {
  const { query, result: record } = useShow({
    meta: { select: "*, transaction_tags(tag_id)" },
  });
  const { isLoading } = query;

  const tagIds: string[] =
    (
      record as unknown as {
        transaction_tags?: Array<{ tag_id: string }>;
      }
    )?.transaction_tags?.map((tt) => tt.tag_id) ?? [];

  const categoryQuery = useOne({
    resource: "categories",
    id: record?.category_id ?? "",
    queryOptions: { enabled: !!record?.category_id },
  });

  const bankAccountQuery = useOne({
    resource: "bank_accounts",
    id: record?.bank_account_id ?? "",
    queryOptions: { enabled: !!record?.bank_account_id },
  });

  const tagsQuery = useMany({
    resource: "tags",
    ids: tagIds,
    queryOptions: { enabled: tagIds.length > 0 },
  });

  const type = record?.type as TransactionType | undefined;
  const amountColor = type ? TRANSACTION_TYPE_HEX[type] : undefined;

  return (
    <Show isLoading={isLoading}>
      <Descriptions
        column={1}
        layout="horizontal"
        colon
        labelStyle={{ fontWeight: 500, minWidth: 130, color: "inherit" }}
      >
        <Descriptions.Item label="Date">
          {record?.date ? dayjs(record.date).format("DD MMM YYYY") : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Type">
          {type && (
            <Tag color={TRANSACTION_TYPE_COLORS[type]}>
              {TRANSACTION_TYPE_LABELS[type]}
            </Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Amount">
          <span style={{ color: amountColor, fontWeight: 600, fontSize: 16 }}>
            {formatCurrency(record?.amount ?? 0)}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Category">
          {categoryQuery.query?.isLoading
            ? "Loading…"
            : (categoryQuery.result?.name as string) ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Bank Account">
          {bankAccountQuery.query?.isLoading
            ? "Loading…"
            : (bankAccountQuery.result?.name as string) ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Tags">
          {tagsQuery.query?.isLoading
            ? "Loading…"
            : tagIds.length === 0
              ? "—"
              : tagsQuery.result?.data?.map((tag) => (
                  <Tag key={tag.id as string}>{tag.name as string}</Tag>
                ))}
        </Descriptions.Item>
        <Descriptions.Item label="Notes">
          {(record?.notes as string) || "—"}
        </Descriptions.Item>
      </Descriptions>
    </Show>
  );
};

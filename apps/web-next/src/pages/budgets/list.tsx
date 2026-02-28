import React from "react";
import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
} from "@refinedev/antd";
import { Table, Space, Tag } from "antd";
import {
  TRANSACTION_TYPE_LABELS,
  TransactionType,
} from "../../constants/transactionTypes";
import { formatCurrency } from "../../utility/currency";

const TYPE_COLORS: Record<TransactionType, string> = {
  earn: "green",
  spend: "red",
  save: "blue",
};

export const BudgetList = () => {
  const invalidate = useInvalidate();

  const { tableProps } = useTable({
    syncWithLocation: true,
    resource: "budgets_with_linked",
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" sorter />
        <Table.Column
          dataIndex="type"
          title="Type"
          render={(value: TransactionType) => (
            <Tag color={TYPE_COLORS[value]}>
              {TRANSACTION_TYPE_LABELS[value]}
            </Tag>
          )}
        />
        <Table.Column
          dataIndex="target_amount"
          title="Target"
          render={(value: number) => formatCurrency(value, "GBP")}
          align="right"
        />
        <Table.Column dataIndex="start_date" title="Start Date" />
        <Table.Column dataIndex="end_date" title="End Date" />
        <Table.Column
          dataIndex="category_count"
          title="Categories"
          align="center"
        />
        <Table.Column dataIndex="tag_count" title="Tags" align="center" />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
              <DeleteButton
                hideText
                size="small"
                recordItemId={record.id}
                resource="budgets"
                onSuccess={() => {
                  invalidate({
                    resource: "budgets_with_linked",
                    invalidates: ["list"],
                  });
                }}
              />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

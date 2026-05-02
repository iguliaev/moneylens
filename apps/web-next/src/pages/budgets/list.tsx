import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
} from "@refinedev/antd";
import { Table, Space, Tag, Progress } from "antd";
import {
  TRANSACTION_TYPE_LABELS,
  TransactionType,
  TYPE_COLORS,
} from "../../constants/transactionTypes";
import { formatCurrency } from "../../utility/currency";
import { useCurrency } from "../../contexts/currency";
import {
  getBudgetAlertState,
  getProgressStatus,
  WARN_STROKE_COLOR,
} from "../../utility/budgetAlerts";

export const BudgetList = () => {
  const invalidate = useInvalidate();
  const { currency } = useCurrency();

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
          render={(value: number) => formatCurrency(value, currency)}
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
          title="Progress"
          key="progress"
          align="center"
          width={160}
          render={(_: unknown, record: BaseRecord) => {
            const currentAmount = Number(record.current_amount ?? 0);
            const targetAmount = Number(record.target_amount ?? 0);
            const { percent, alertLevel } = getBudgetAlertState(
              currentAmount,
              targetAmount,
              record.type as TransactionType,
            );
            return (
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Progress
                  percent={percent}
                  size="small"
                  status={getProgressStatus(
                    alertLevel,
                    percent,
                    record.type as TransactionType,
                  )}
                  strokeColor={
                    alertLevel === "warn" ? WARN_STROKE_COLOR : undefined
                  }
                  format={() => `${percent}%`}
                />
                {alertLevel === "warn" && (
                  <Tag color="warning" style={{ fontSize: 11 }}>
                    ⚠ Near limit
                  </Tag>
                )}
                {alertLevel === "over" && (
                  <Tag color="error" style={{ fontSize: 11 }}>
                    Over budget
                  </Tag>
                )}
              </Space>
            );
          }}
        />
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

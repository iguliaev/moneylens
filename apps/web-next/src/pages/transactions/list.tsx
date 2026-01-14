import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
  DateField,
  TagField,
} from "@refinedev/antd";
import { Table, Space, Segmented } from "antd";
import { useState } from "react";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from "../../constants/transactionTypes";

export const TransactionList = () => {
  const invalidate = useInvalidate();
  const [transactionType, setTransactionType] = useState<string>(
    TRANSACTION_TYPES.SPEND
  );

  const { tableProps } = useTable({
    syncWithLocation: true,
    resource: "transactions_with_details",
    filters: {
      permanent: [
        {
          field: "type",
          operator: "eq",
          value: transactionType,
        },
      ],
    },
  });

  return (
    <List>
      <Segmented
        options={Object.values(TRANSACTION_TYPES).map((type) => ({
          label: TRANSACTION_TYPE_LABELS[type],
          value: type,
        }))}
        value={transactionType}
        onChange={(value) => setTransactionType(value as string)}
      />
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex={["date"]}
          title="Date"
          sorter
          render={(value: any) => <DateField value={value} />}
        />
        <Table.Column dataIndex="category_name" title="Category" sorter />
        <Table.Column dataIndex="amount" title="Amount" sorter />
        <Table.Column
          dataIndex="tag_names"
          title="Tags"
          render={(value: string[]) => (
            <>
              {value?.map((tagName, index) => (
                <TagField key={index} value={tagName} />
              ))}
            </>
          )}
        />
        <Table.Column
          dataIndex="bank_account_name"
          title="Bank Account"
          sorter
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
                resource="transactions"
                onSuccess={() => {
                  invalidate({
                    resource: "transactions_with_details",
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

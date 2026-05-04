import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
} from "@refinedev/antd";
import { Table, Space, Segmented } from "antd";
import { useState } from "react";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "../../constants/transactionTypes";
import { getCategoryEmptyState, TableSkeleton } from "../../components";

export const CategoryList = () => {
  const invalidate = useInvalidate();
  const [categoryType, setCategoryType] = useState<string>(
    TRANSACTION_TYPES.EARN
  );

  const { tableProps } = useTable({
    syncWithLocation: true,
    resource: "categories_with_usage",
    filters: {
      permanent: [
        {
          field: "type",
          operator: "eq",
          value: categoryType,
        },
      ],
    },
  });

  // Always call to keep React hook call count consistent (internally calls useNavigation())
  const categoryEmptyState = getCategoryEmptyState();

  return (
    <List>
      <Segmented
        aria-label="segmented control"
        options={Object.values(TRANSACTION_TYPES).map((type) => ({
          label: TRANSACTION_TYPE_LABELS[type],
          value: type,
        }))}
        value={categoryType}
        onChange={(value) => setCategoryType(value as string)}
      />
      {tableProps.loading && !tableProps.dataSource?.length ? (
        <TableSkeleton columns={4} />
      ) : (
      <Table {...tableProps} rowKey="id" locale={{ emptyText: categoryEmptyState }}>
        <Table.Column dataIndex="name" title="Name" sorter />
        <Table.Column dataIndex="description" title="Description" sorter />
        <Table.Column dataIndex="in_use_count" title="Usage Count" sorter />
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
                resource="categories"
                onSuccess={() => {
                  invalidate({
                    resource: "categories_with_usage",
                    invalidates: ["list"],
                  });
                }}
              />
            </Space>
          )}
        />
      </Table>
      )}
    </List>
  );
};

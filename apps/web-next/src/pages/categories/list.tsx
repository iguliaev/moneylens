import { BaseRecord } from "@refinedev/core";
import { useTable, List, EditButton, ShowButton } from "@refinedev/antd";
import { Table, Space, Segmented } from "antd";
import { useState } from "react";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "../../constants/transactionTypes";

export const CategoryList = () => {
  const [categoryType, setCategoryType] = useState<string>(
    TRANSACTION_TYPES.EARN
  );

  const { tableProps } = useTable({
    syncWithLocation: true,
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

  return (
    <List>
      <Segmented
        options={Object.values(TRANSACTION_TYPES).map((type) => ({
          label: TRANSACTION_TYPE_LABELS[type],
          value: type,
        }))}
        value={categoryType}
        onChange={(value) => setCategoryType(value as string)}
      />
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" sorter />
        <Table.Column dataIndex="description" title="Description" sorter />
        {/* <Table.Column dataIndex="type" title="Type" sorter /> */}
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

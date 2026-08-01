import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
} from "@refinedev/antd";
import { Table, Space, Segmented, Button } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "../../constants/transactionTypes";
import { useCategoryEmptyState, TableSkeleton } from "../../components";

export const CategoryList = () => {
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [categoryType, setCategoryType] = useState<string>(
    TRANSACTION_TYPES.EARN
  );

  const { tableProps, setCurrentPage } = useTable({
    syncWithLocation: true,
    resource: "categories_with_usage",
    sorters: {
      initial: [{ field: "sort_label", order: "asc" }],
    },
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
  const categoryEmptyState = useCategoryEmptyState();

  return (
    <List
      headerButtons={() => (
        <Button
          type="primary"
          onClick={() => {
            const params = new URLSearchParams({
              source: "categories-list",
              type: categoryType,
            });
            navigate(`/categories/create?${params.toString()}`);
          }}
        >
          Create
        </Button>
      )}
    >
      <Segmented
        aria-label="segmented control"
        options={Object.values(TRANSACTION_TYPES).map((type) => ({
          label: TRANSACTION_TYPE_LABELS[type],
          value: type,
        }))}
        value={categoryType}
        onChange={(value) => {
          const nextType = value as string;
          if (nextType === categoryType) return;
          setCurrentPage(1);
          setCategoryType(nextType);
        }}
      />
      {tableProps.loading && !tableProps.dataSource?.length ? (
        <TableSkeleton columns={4} />
      ) : (
        <Table
          {...tableProps}
          rowKey="id"
          locale={{ emptyText: categoryEmptyState }}
        >
          <Table.Column
            dataIndex="name"
            title="Name"
            render={(value: string, record: BaseRecord) =>
              record.parent_name ? `${record.parent_name} / ${value}` : value
            }
          />
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

import React from "react";
import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
} from "@refinedev/antd";
import { Table, Space } from "antd";
import { TableSkeleton } from "../TableSkeleton";

export interface Column {
  dataIndex: string;
  title: string;
  render?: (value: unknown, record: BaseRecord) => React.ReactNode;
}

export interface ResourceListProps {
  resource: string;
  columns: Column[];
  showActions?: boolean;
  deleteResource?: string;
  emptyStateBuilder?: () => React.ReactNode;
}

export const ResourceList: React.FC<ResourceListProps> = ({
  resource,
  columns,
  showActions = true,
  deleteResource,
  emptyStateBuilder,
}) => {
  const invalidate = useInvalidate();
  const { tableProps } = useTable({
    syncWithLocation: true,
    resource,
  });

  // Always call emptyStateBuilder() to keep React hook call count consistent
  // (emptyStateBuilder functions internally call useNavigation())
  const emptyText = emptyStateBuilder ? emptyStateBuilder() : undefined;
  const colCount = columns.length + (showActions ? 1 : 0);
  const showSkeleton = tableProps.loading && !tableProps.dataSource?.length;

  return (
    <List>
      {showSkeleton ? (
        <TableSkeleton columns={colCount} />
      ) : (
        <Table
          {...tableProps}
          rowKey="id"
          locale={emptyText ? { emptyText } : undefined}
        >
          {columns.map((column) => (
            <Table.Column
              key={column.dataIndex}
              dataIndex={column.dataIndex}
              title={column.title}
              render={column.render}
            />
          ))}
          {showActions && (
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
                    resource={deleteResource}
                    onSuccess={() => {
                      if (deleteResource && deleteResource !== resource) {
                        invalidate({
                          resource: resource,
                          invalidates: ["list"],
                        });
                      }
                    }}
                  />
                </Space>
              )}
            />
          )}
        </Table>
      )}
    </List>
  );
};

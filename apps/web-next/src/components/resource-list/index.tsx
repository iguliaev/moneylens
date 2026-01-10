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

export interface Column {
  dataIndex: string;
  title: string;
  render?: (value: any, record: BaseRecord) => React.ReactNode;
}

export interface ResourceListProps {
  resource: string;
  columns: Column[];
  showActions?: boolean;
  deleteResource?: string;
}

export const ResourceList: React.FC<ResourceListProps> = ({
  resource,
  columns,
  showActions = true,
  deleteResource,
}) => {
  const invalidate = useInvalidate();
  const { tableProps } = useTable({
    syncWithLocation: true,
    resource,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
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
    </List>
  );
};

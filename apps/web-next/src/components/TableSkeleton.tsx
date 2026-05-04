import React from "react";
import { Skeleton, Table } from "antd";
import type { TablePaginationConfig } from "antd";

interface TableSkeletonProps {
  columns: number;
  rows?: number;
  pagination?: false | TablePaginationConfig;
}

const fakeColumns = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    key: `col-${i}`,
    dataIndex: `col-${i}`,
    title: <Skeleton.Input active size="small" style={{ width: 60 }} />,
    render: () => (
      <Skeleton.Input active size="small" style={{ width: "80%" }} />
    ),
  }));

const fakeRows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ key: i }));

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  columns,
  rows = 8,
  pagination = false,
}) => (
  <Table
    dataSource={fakeRows(rows)}
    columns={fakeColumns(columns)}
    pagination={pagination}
    rowKey="key"
  />
);

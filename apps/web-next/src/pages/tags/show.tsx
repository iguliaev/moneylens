import { useShow } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Descriptions } from "antd";
import dayjs from "dayjs";

export const TagShow = () => {
  const { query, result: record } = useShow();
  const { isLoading } = query;

  return (
    <Show isLoading={isLoading}>
      <Descriptions
        column={1}
        layout="horizontal"
        colon
        labelStyle={{ fontWeight: 500, minWidth: 130, color: "inherit" }}
      >
        <Descriptions.Item label="Name">
          {(record?.name as string) ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Description">
          {(record?.description as string) || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Created At">
          {record?.created_at
            ? dayjs(record.created_at as string).format("DD MMM YYYY")
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Updated At">
          {record?.updated_at
            ? dayjs(record.updated_at as string).format("DD MMM YYYY")
            : "—"}
        </Descriptions.Item>
      </Descriptions>
    </Show>
  );
};

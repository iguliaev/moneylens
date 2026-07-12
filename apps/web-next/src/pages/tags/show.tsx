import { useShow } from "@refinedev/core";
import { Show, TextField } from "@refinedev/antd";
import { Typography } from "antd";
import { formatDisplayDate } from "../../utility/dateDisplay";

const { Title } = Typography;

export const TagShow = () => {
  const { query, result: record } = useShow();
  const { isLoading } = query;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Name</Title>
      <TextField value={record?.name} />
      <Title level={5}>Description</Title>
      <TextField value={record?.description} />
      <Title level={5}>Created At</Title>
      <TextField value={formatDisplayDate(record?.created_at)} />
      <Title level={5}>Updated At</Title>
      <TextField value={formatDisplayDate(record?.updated_at)} />
    </Show>
  );
};

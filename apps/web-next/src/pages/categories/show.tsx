import { useShow } from "@refinedev/core";
import { Show, TextField, DateField } from "@refinedev/antd";
import { Typography } from "antd";

const { Title } = Typography;

export const CategoryShow = () => {
  const {
    result: record,
    query: { isLoading },
  } = useShow();

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Type</Title>
      <TextField value={record?.type} />
      <Title level={5}>Name</Title>
      <TextField value={record?.name} />
      <Title level={5}>Description</Title>
      <TextField value={record?.description} />
      <Title level={5}>Created At</Title>
      <DateField value={record?.created_at} />
      <Title level={5}>Updated At</Title>
      <DateField value={record?.updated_at} />
    </Show>
  );
};

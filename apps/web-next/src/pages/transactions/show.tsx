import { useShow, useOne } from "@refinedev/core";
import { Show, TextField, DateField } from "@refinedev/antd";
import { Typography } from "antd";
import { formatCurrency } from "../../utility";

const { Title } = Typography;

export const TransactionShow = () => {
  const { query, result: record } = useShow();
  const isLoading = query?.isLoading;

  const categoryQuery = useOne({
    resource: "categories",
    id: record?.category_id || "",
    queryOptions: {
      enabled: !!record,
    },
  });
  const categoryData = categoryQuery.result;
  const categoryIsLoading = categoryQuery.query?.isLoading;

  const bankAccountQuery = useOne({
    resource: "bank_accounts",
    id: record?.bank_account_id || "",
    queryOptions: {
      enabled: !!record,
    },
  });
  const bankAccountData = bankAccountQuery.result;
  const bankAccountIsLoading = bankAccountQuery.query?.isLoading;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Date</Title>
      <DateField value={record?.date} />
      <Title level={5}>Type</Title>
      <TextField value={record?.type} />
      <Title level={5}>Category</Title>
      {categoryIsLoading ? <>Loading...</> : <>{categoryData?.name}</>}
      <Title level={5}>Amount</Title>
      <TextField value={formatCurrency(record?.amount ?? 0, "GBP")} />
      <Title level={5}>Bank Account</Title>
      {bankAccountIsLoading ? <>Loading...</> : <>{bankAccountData?.name}</>}
      <Title level={5}>Notes</Title>
      <TextField value={record?.notes} />
    </Show>
  );
};

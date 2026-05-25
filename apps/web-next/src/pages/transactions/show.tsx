import { useShow, useOne } from "@refinedev/core";
import { Show, TextField, DateField } from "@refinedev/antd";
import { Typography, Skeleton } from "antd";
import { formatCurrency } from "../../utility";
import { useCurrency } from "../../contexts/currency";

const { Title } = Typography;

export const TransactionShow = () => {
  const { query, result: record } = useShow();
  const { isLoading } = query;
  const { currency } = useCurrency();

  const categoryQuery = useOne({
    resource: "categories",
    id: record?.category_id ?? "",
    queryOptions: {
      enabled: !!record?.category_id,
    },
  });
  const categoryData = categoryQuery.result;
  const categoryIsLoading = categoryQuery.query?.isLoading;

  const bankAccountQuery = useOne({
    resource: "bank_accounts",
    id: record?.bank_account_id ?? "",
    queryOptions: {
      enabled: !!record?.bank_account_id,
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
      {categoryIsLoading ? (
        <Skeleton.Input active size="small" style={{ width: 120 }} />
      ) : (
        <>{categoryData?.name}</>
      )}
      <Title level={5}>Amount</Title>
      <TextField value={formatCurrency(record?.amount ?? 0, currency)} />
      <Title level={5}>Bank Account</Title>
      {bankAccountIsLoading ? (
        <Skeleton.Input active size="small" style={{ width: 120 }} />
      ) : (
        <>{bankAccountData?.name}</>
      )}
      <Title level={5}>Notes</Title>
      <TextField value={record?.notes} />
    </Show>
  );
};

import { useMemo } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, DatePicker, Select, InputNumber, Input } from "antd";
import dayjs from "dayjs";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { useTransactionForm } from "../../hooks";

export const TransactionCreate = () => {
  const { formProps, saveButtonProps } = useForm();
  const { handleFinish, isLoading } = useTransactionForm({ mode: "create" });

  const type = Form.useWatch("type", formProps.form);

  const { selectProps: categorySelectProps } = useSelect({
    resource: "categories",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
    filters: type
      ? [
          {
            field: "type",
            operator: "eq",
            value: type,
          },
        ]
      : undefined,
  });

  // Fetch all available tags
  const { query: tagsQuery } = useList({
    resource: "tags",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const tagOptions = useMemo(() => {
    return (
      tagsQuery.data?.data?.map((tag) => ({
        label: tag.name as string,
        value: tag.id as string,
      })) ?? []
    );
  }, [tagsQuery.data]);

  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  return (
    <Create saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
      <Form
        {...formProps}
        layout="vertical"
        onFinish={handleFinish as (values: unknown) => void}
      >
        <Form.Item
          label="Date"
          name={["date"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          label="Type"
          name={["type"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select
            options={TRANSACTION_TYPE_OPTIONS}
            onChange={() =>
              formProps.form?.setFieldValue("category_id", undefined)
            }
          />
        </Form.Item>
        <Form.Item
          label="Category"
          name={"category_id"}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select {...categorySelectProps} />
        </Form.Item>
        <Form.Item
          label="Amount"
          name={["amount"]}
          rules={[
            { required: true },
            {
              validator: (_, value) =>
                value === null || value === undefined || value === 0
                  ? Promise.reject(new Error("Amount cannot be zero"))
                  : Promise.resolve(),
            },
          ]}
        >
          <InputNumber precision={2} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          label="Bank Account"
          name={"bank_account_id"}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select {...bankAccountSelectProps} />
        </Form.Item>
        <Form.Item label="Tags" name={"tag_ids"}>
          <Select
            mode="multiple"
            options={tagOptions}
            loading={tagsQuery.isLoading}
            placeholder="Select tags"
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </Form.Item>
        <Form.Item label="Notes" name={["notes"]}>
          <Input />
        </Form.Item>
      </Form>
    </Create>
  );
};

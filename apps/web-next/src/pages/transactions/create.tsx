import React from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select } from "antd";
import dayjs from "dayjs";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";

export const TransactionCreate = () => {
  const { formProps, saveButtonProps, query } = useForm();

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

  const { selectProps: tagsSelectProps } = useSelect({
    resource: "tags",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
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
          <DatePicker />
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
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Tags" name={"tags"}>
          <Select mode="multiple" {...tagsSelectProps} />
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
      </Form>
    </Create>
  );
};

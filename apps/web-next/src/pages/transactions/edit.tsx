import React from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select } from "antd";
import dayjs from "dayjs";

export const TransactionEdit = () => {
  const { formProps, saveButtonProps, query } = useForm();

  const transactionsData = query?.data?.data;

  const { selectProps: categorySelectProps } = useSelect({
    resource: "categories",
    defaultValue: transactionsData?.category_id,
    optionLabel: "name",
  });

  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    defaultValue: transactionsData?.bank_account_id,
    optionLabel: "name",
  });

  return (
    <Edit saveButtonProps={saveButtonProps}>
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
          <Input />
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
        <Form.Item label="Notes" name={["notes"]}>
          <Input />
        </Form.Item>
      </Form>
    </Edit>
  );
};

import React, { useMemo } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, Input, DatePicker, Select } from "antd";
import dayjs from "dayjs";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { supabaseClient } from "../../utility";

export const TransactionCreate = () => {
  const { formProps, saveButtonProps } = useForm();

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

  // Custom onFinish to handle tags via RPC after transaction is created
  const handleFinish = async (values: any) => {
    const { tag_ids, ...transactionValues } = values;

    // Create the transaction and get the new ID
    const result = await formProps.onFinish?.(transactionValues);

    // Then set tags via RPC if we have a transaction ID
    const transactionId = (result as any)?.data?.id;
    if (transactionId && tag_ids?.length > 0) {
      await supabaseClient.rpc("set_transaction_tags", {
        p_transaction_id: transactionId,
        p_tag_ids: tag_ids,
      });
    }
  };

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical" onFinish={handleFinish}>
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
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Create>
  );
};

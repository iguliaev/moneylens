import React, { useMemo } from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { useList, useOne } from "@refinedev/core";
import { Form, Input, DatePicker, Select } from "antd";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_OPTIONS,
  TransactionType,
} from "../../constants/transactionTypes";

export const TransactionEdit = () => {
  const { formProps, saveButtonProps, query } = useForm();

  const transactionsData = query?.data?.data;

  // Watch the type field to filter categories accordingly
  const selectedType = Form.useWatch("type", formProps.form) as
    | TransactionType
    | undefined;

  // Track if type has changed from original
  const originalType = transactionsData?.type;
  const typeHasChanged =
    selectedType !== undefined && selectedType !== originalType;

  // Fetch current category details to show label on initial load
  const { query: currentCategoryQuery } = useOne({
    resource: "categories",
    id: transactionsData?.category_id,
    queryOptions: {
      enabled: !!transactionsData?.category_id && !typeHasChanged,
    },
  });

  // Use useList for full control over category options
  const { query: categoriesQuery } = useList({
    resource: "categories",
    filters: selectedType
      ? [
          {
            field: "type",
            operator: "eq",
            value: selectedType,
          },
        ]
      : undefined,
    queryOptions: {
      enabled: !!selectedType,
    },
  });

  // Build category options from the filtered data
  const categoryOptions = useMemo(() => {
    const options =
      categoriesQuery.data?.data?.map((category) => ({
        label: category.name as string,
        value: category.id as string,
      })) ?? [];

    // If we have the current category loaded and it's not already in the list, add it
    // This ensures the label shows correctly on initial load
    const currentCategory = currentCategoryQuery.data?.data;
    if (
      currentCategory &&
      !typeHasChanged &&
      !options.some((opt) => opt.value === currentCategory.id)
    ) {
      options.unshift({
        label: currentCategory.name as string,
        value: currentCategory.id as string,
      });
    }

    return options;
  }, [categoriesQuery.data, currentCategoryQuery.data, typeHasChanged]);

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
          <Select
            options={TRANSACTION_TYPE_OPTIONS}
            onChange={() => {
              // Clear category when type changes since categories are type-specific
              formProps.form?.setFieldValue("category_id", undefined);
            }}
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
          <Select
            options={categoryOptions}
            loading={categoriesQuery.isLoading}
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
          />
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

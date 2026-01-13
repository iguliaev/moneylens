import React, { useEffect, useMemo } from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { useList, useOne } from "@refinedev/core";
import { Form, Input, DatePicker, Select } from "antd";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_OPTIONS,
  TransactionType,
} from "../../constants/transactionTypes";
import { supabaseClient } from "../../utility";

export const TransactionEdit = () => {
  const { formProps, saveButtonProps, query, id } = useForm({
    meta: {
      select: "*, transaction_tags(tag_id)",
    },
  });

  const transactionsData = query?.data?.data;

  // Extract tag IDs from the nested transaction_tags relationship
  const currentTagIds = useMemo(() => {
    const transactionTags = (transactionsData as any)?.transaction_tags ?? [];
    return transactionTags.map((tt: { tag_id: string }) => tt.tag_id);
  }, [transactionsData]);

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

  // Fetch all available tags
  const { query: tagsQuery } = useList({
    resource: "tags",
    pagination: { pageSize: 1000 },
  });

  const tagOptions = useMemo(() => {
    return (
      tagsQuery.data?.data?.map((tag) => ({
        label: tag.name as string,
        value: tag.id as string,
      })) ?? []
    );
  }, [tagsQuery.data]);

  // Set initial tag values when transaction data is loaded
  useEffect(() => {
    if (currentTagIds.length > 0 && formProps.form) {
      formProps.form.setFieldValue("tag_ids", currentTagIds);
    }
  }, [currentTagIds, formProps.form]);

  // Custom onFinish to handle tags via RPC
  const handleFinish = async (values: any) => {
    const { tag_ids, ...transactionValues } = values;

    // First save the transaction (via default form behavior)
    await formProps.onFinish?.(transactionValues);

    // Then update tags via RPC
    if (id) {
      await supabaseClient.rpc("set_transaction_tags", {
        p_transaction_id: id as string,
        p_tag_ids: tag_ids ?? [],
      });
    }
  };

  return (
    <Edit saveButtonProps={saveButtonProps}>
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
    </Edit>
  );
};

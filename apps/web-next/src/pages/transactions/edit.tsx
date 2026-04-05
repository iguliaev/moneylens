import { useEffect, useMemo } from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, DatePicker, Select, InputNumber, Input, message } from "antd";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_OPTIONS,
  TransactionType,
} from "../../constants/transactionTypes";
import { supabaseClient } from "../../utility";

export const TransactionEdit = () => {
  const { formProps, saveButtonProps, query, id, formLoading } = useForm({
    meta: {
      select: "*, transaction_tags(tag_id), category:categories(id, name)",
    },
  });

  const transactionsData = query?.data?.data;

  // Extract tag IDs from the nested transaction_tags relationship
  const currentTagIds = useMemo(() => {
    const transactionTags =
      (transactionsData as { transaction_tags?: Array<{ tag_id: string }> })
        ?.transaction_tags ?? [];
    return transactionTags.map((tt) => tt.tag_id);
  }, [transactionsData]);

  // Watch the type field to filter categories accordingly
  const selectedType = Form.useWatch("type", formProps.form) as
    | TransactionType
    | undefined;

  // Use useSelect for categories with type filtering
  const { selectProps: categorySelectProps, query: categoriesQuery } =
    useSelect({
      resource: "categories",
      optionLabel: "name",
      optionValue: "id",
      pagination: { mode: "off" },
      sorters: [{ field: "name", order: "asc" }],
      filters: selectedType
        ? [
            {
              field: "type",
              operator: "eq",
              value: selectedType,
            },
          ]
        : [],
      queryOptions: {
        enabled: !!selectedType,
      },
    });

  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    defaultValue: transactionsData?.bank_account_id,
    optionLabel: "name",
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

  // Set initial tag values when transaction data is loaded
  useEffect(() => {
    if (currentTagIds.length > 0 && formProps.form) {
      formProps.form.setFieldValue("tag_ids", currentTagIds);
    }
  }, [currentTagIds, formProps.form]);

  // Custom onFinish to handle tags via RPC
  const handleFinish = async (values: Record<string, unknown>) => {
    const { tag_ids, ...transactionValues } = values;

    // First save the transaction (via default form behavior)
    await formProps.onFinish?.(transactionValues);

    // Then update tags via RPC
    if (id) {
      try {
        await supabaseClient.rpc("set_transaction_tags", {
          p_transaction_id: id as string,
          p_tag_ids: tag_ids ?? [],
        });
      } catch (error) {
        console.error("Failed to set transaction tags:", error);
        // Optionally show user-friendly error message
        message.error("Transaction saved but failed to update tags");
      }
    }
  };

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
        onFinish={handleFinish}
        data-testid="transaction-edit-form"
        aria-busy={formLoading}
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
            {...categorySelectProps}
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
            { required: true },
            {
              type: "number",
              min: 0.01,
              message: "Amount must be greater than 0",
            },
          ]}
        >
          <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
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

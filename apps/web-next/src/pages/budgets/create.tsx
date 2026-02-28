import React, { useMemo } from "react";
import { Create, useForm } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, Input, InputNumber, Select, DatePicker, message } from "antd";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { supabaseClient } from "../../utility";

export const BudgetCreate = () => {
  const { formProps, saveButtonProps } = useForm();

  const selectedType = Form.useWatch("type", formProps.form);

  const { query: categoriesQuery } = useList({
    resource: "categories",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const { query: tagsQuery } = useList({
    resource: "tags",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const categoryOptions = useMemo(
    () =>
      categoriesQuery.data?.data
        ?.filter((c) => !selectedType || c.type === selectedType)
        .map((c) => ({
          label: `${c.name} (${c.type})`,
          value: c.id as string,
        })) ?? [],
    [categoriesQuery.data, selectedType]
  );

  const tagOptions = useMemo(
    () =>
      tagsQuery.data?.data?.map((t) => ({
        label: t.name as string,
        value: t.id as string,
      })) ?? [],
    [tagsQuery.data]
  );

  const handleFinish = async (values: Record<string, unknown>) => {
    const { category_ids, tag_ids, ...budgetValues } = values;

    const result = await formProps.onFinish?.(budgetValues);
    const budgetId = (result as unknown as { data?: { id?: string } })?.data
      ?.id;

    if (!budgetId) return;

    const errors: string[] = [];

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const { error } = await supabaseClient.from("budget_categories").insert(
        category_ids.map((category_id: string) => ({
          budget_id: budgetId,
          category_id,
        }))
      );
      if (error) errors.push("categories");
    }

    if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      const { error } = await supabaseClient
        .from("budget_tags")
        .insert(
          tag_ids.map((tag_id: string) => ({ budget_id: budgetId, tag_id }))
        );
      if (error) errors.push("tags");
    }

    if (errors.length > 0) {
      message.error(`Budget created but failed to link: ${errors.join(", ")}`);
    }
  };

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical" onFinish={handleFinish}>
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input />
        </Form.Item>
        <Form.Item label="Type" name="type" rules={[{ required: true }]}>
          <Select
            options={TRANSACTION_TYPE_OPTIONS}
            onChange={() => formProps.form?.setFieldValue("category_ids", [])}
          />
        </Form.Item>
        <Form.Item
          label="Target Amount"
          name="target_amount"
          rules={[{ required: true }]}
        >
          <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Start Date" name="start_date">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="End Date" name="end_date">
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Categories" name="category_ids">
          <Select
            mode="multiple"
            options={categoryOptions}
            loading={categoriesQuery.isLoading}
            placeholder="Select categories"
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </Form.Item>
        <Form.Item label="Tags" name="tag_ids">
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
      </Form>
    </Create>
  );
};

import React, { useEffect, useMemo } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, Input, InputNumber, Select, DatePicker, message } from "antd";
import dayjs from "dayjs";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { supabaseClient } from "../../utility";

export const BudgetEdit = () => {
  const { formProps, saveButtonProps, query, id, formLoading } = useForm({
    meta: {
      select: "*, budget_categories(category_id), budget_tags(tag_id)",
    },
  });

  const budgetData = query?.data?.data;

  const selectedType = Form.useWatch("type", formProps.form);

  const currentCategoryIds = useMemo(() => {
    const rows =
      (
        budgetData as {
          budget_categories?: Array<{ category_id: string }>;
        }
      )?.budget_categories ?? [];
    return rows.map((r) => r.category_id);
  }, [budgetData]);

  const currentTagIds = useMemo(() => {
    const rows =
      (budgetData as { budget_tags?: Array<{ tag_id: string }> })
        ?.budget_tags ?? [];
    return rows.map((r) => r.tag_id);
  }, [budgetData]);

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

  useEffect(() => {
    if (!formProps.form) return;
    formProps.form.setFieldValue("category_ids", currentCategoryIds);
    formProps.form.setFieldValue("tag_ids", currentTagIds);
  }, [currentCategoryIds, currentTagIds, formProps.form]);

  const handleFinish = async (values: Record<string, unknown>) => {
    const { category_ids, tag_ids, ...budgetValues } = values;

    await formProps.onFinish?.(budgetValues);

    if (!id) return;

    const errors: string[] = [];

    // Replace categories
    const { error: delCatError } = await supabaseClient
      .from("budget_categories")
      .delete()
      .eq("budget_id", id);
    if (delCatError) {
      errors.push("categories (delete)");
    } else if (Array.isArray(category_ids) && category_ids.length > 0) {
      const { error } = await supabaseClient.from("budget_categories").insert(
        category_ids.map((category_id: string) => ({
          budget_id: id,
          category_id,
        }))
      );
      if (error) errors.push("categories (insert)");
    }

    // Replace tags
    const { error: delTagError } = await supabaseClient
      .from("budget_tags")
      .delete()
      .eq("budget_id", id);
    if (delTagError) {
      errors.push("tags (delete)");
    } else if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      const { error } = await supabaseClient
        .from("budget_tags")
        .insert(tag_ids.map((tag_id: string) => ({ budget_id: id, tag_id })));
      if (error) errors.push("tags (insert)");
    }

    if (errors.length > 0) {
      message.error(`Budget saved but failed to update: ${errors.join(", ")}`);
    }
  };

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
        onFinish={handleFinish}
        data-testid="budget-edit-form"
        aria-busy={formLoading}
      >
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
        <Form.Item
          label="Start Date"
          name="start_date"
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          label="End Date"
          name="end_date"
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
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
    </Edit>
  );
};

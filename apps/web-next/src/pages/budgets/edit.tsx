import { useEffect, useMemo } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, Input, InputNumber, Select, DatePicker } from "antd";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { useBudgetForm } from "../../hooks";
import {
  DATE_PICKER_INPUT_FORMATS,
  simpleLabelFilterOption,
  toDayjs,
} from "../../utility";
import type { Category } from "../../utility/categoryHierarchy";
import {
  categoryLabel,
  compareCategoriesByHierarchyLabel,
} from "../../utility/categoryHierarchy";

export const BudgetEdit = () => {
  const { formProps, saveButtonProps, query, id, formLoading } = useForm({
    meta: {
      select: "*, budget_categories(category_id), budget_tags(tag_id)",
    },
    warnWhenUnsavedChanges: false,
  });
  const { handleFinish, isLoading } = useBudgetForm({
    mode: "edit",
    id: id?.toString(),
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

  const { query: categoriesQuery } = useList<Category>({
    resource: "categories_with_usage",
    pagination: { mode: "off" },
    filters: selectedType
      ? [{ field: "type", operator: "eq", value: selectedType }]
      : [],
  });

  const { query: tagsQuery } = useList({
    resource: "tags_with_usage",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const categoryOptions = useMemo(
    () =>
      [...(categoriesQuery.data?.data ?? [])]
        .sort(compareCategoriesByHierarchyLabel)
        .map((c: Category) => ({
          label: `${categoryLabel(c)} (${c.type})`,
          value: c.id as string,
        })) ?? [],
    [categoriesQuery.data]
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

  return (
    <Edit saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
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
          getValueProps={(value) => ({ value: toDayjs(value) })}
          getValueFromEvent={(date) => date?.format("YYYY-MM-DD")}
        >
          <DatePicker
            format={DATE_PICKER_INPUT_FORMATS}
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item
          label="End Date"
          name="end_date"
          getValueProps={(value) => ({ value: toDayjs(value) })}
          getValueFromEvent={(date) => date?.format("YYYY-MM-DD")}
        >
          <DatePicker
            format={DATE_PICKER_INPUT_FORMATS}
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item label="Categories" name="category_ids">
          <Select
            mode="multiple"
            options={categoryOptions}
            loading={categoriesQuery.isLoading}
            placeholder="Select categories"
            showSearch
            filterOption={simpleLabelFilterOption}
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
            filterOption={simpleLabelFilterOption}
            allowClear
          />
        </Form.Item>
      </Form>
    </Edit>
  );
};

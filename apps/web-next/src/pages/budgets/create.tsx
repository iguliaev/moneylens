import { useMemo } from "react";
import { Create, useForm } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, Input, InputNumber, Select, DatePicker } from "antd";
import dayjs from "dayjs";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { useBudgetForm } from "../../hooks";
import { DATE_PICKER_INPUT_FORMATS } from "../../utility";
import type { Category } from "../../utility/categoryHierarchy";
import {
  categoryLabel,
  compareCategoriesByHierarchyLabel,
} from "../../utility/categoryHierarchy";

export const BudgetCreate = () => {
  const { formProps, saveButtonProps } = useForm({
    warnWhenUnsavedChanges: false,
  });
  const { handleFinish, isLoading } = useBudgetForm({ mode: "create" });

  const selectedType = Form.useWatch("type", formProps.form);

  const { query: categoriesQuery } = useList<Category>({
    resource: "categories_with_usage",
    pagination: { mode: "off" },
    filters: selectedType
      ? [{ field: "type", operator: "eq", value: selectedType }]
      : [],
  });

  const { query: tagsQuery } = useList({
    resource: "tags",
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

  return (
    <Create saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
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
        <Form.Item
          label="Start Date"
          name="start_date"
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
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
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
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

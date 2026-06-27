import { useEffect, useMemo } from "react";
import { Edit, useForm, useSelect as useAntSelect } from "@refinedev/antd";
import { useSelect as useCoreSelect, useList } from "@refinedev/core";
import { Form, DatePicker, Select, InputNumber, Input } from "antd";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_OPTIONS,
  TransactionType,
} from "../../constants/transactionTypes";
import { useTransactionForm } from "../../hooks";
import type { Category } from "../../utility/categoryHierarchy";
import {
  categoryLabel as formatCategoryLabel,
  categorySearchText as getCategorySearchText,
  isLeafCategory,
} from "../../utility/categoryHierarchy";

export const TransactionEdit = () => {
  const { formProps, saveButtonProps, query, id, formLoading } = useForm({
    meta: {
      select: "*, transaction_tags(tag_id), category:categories(id, name)",
    },
    warnWhenUnsavedChanges: false,
  });
  const { handleFinish, isLoading } = useTransactionForm({
    mode: "edit",
    id: id?.toString(),
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
  const { result: categoriesResult, query: categoriesQuery } =
    useList<Category>({
      resource: "categories_with_usage",
      pagination: { mode: "off" },
      sorters: [{ field: "name", order: "asc" }],
      filters: selectedType
        ? [{ field: "type", operator: "eq", value: selectedType }]
        : [],
      queryOptions: { enabled: !!selectedType },
    });

  const currentCategoryId = transactionsData?.category_id as string | undefined;

  const leafCategoryOptions = useMemo(() => {
    const all = categoriesResult?.data ?? [];
    const leaves = all.filter(isLeafCategory).map((c: Category) => ({
      label: formatCategoryLabel(c),
      value: c.id,
      searchText: getCategorySearchText(c),
    }));
    // Always include the current category even if it has since become a parent,
    // so the form doesn't show a raw UUID or blank value.
    if (
      currentCategoryId &&
      !leaves.some((o) => o.value === currentCategoryId)
    ) {
      const current = all.find((c: Category) => c.id === currentCategoryId);
      if (current) {
        leaves.unshift({
          label: formatCategoryLabel(current),
          value: current.id,
          searchText: getCategorySearchText(current),
        });
      }
    }
    return leaves;
  }, [categoriesResult?.data, currentCategoryId]);

  const { selectProps: bankAccountSelectProps } = useAntSelect({
    resource: "bank_accounts",
    defaultValue: transactionsData?.bank_account_id,
    optionLabel: "name",
  });

  // Fetch all available tags
  const { options: tagOptions, query: tagsQuery } = useCoreSelect({
    resource: "tags",
    optionLabel: "name",
    optionValue: "id",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  // Set initial tag values when transaction data is loaded (including clearing for untagged transactions)
  useEffect(() => {
    if (formProps.form) {
      formProps.form.setFieldValue("tag_ids", currentTagIds);
    }
  }, [currentTagIds, formProps.form]);

  return (
    <Edit saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
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
            options={leafCategoryOptions}
            loading={categoriesQuery.isLoading}
            showSearch
            filterOption={(input, option) => {
              const normalized = input.toLowerCase();
              const label = String(option?.label ?? "").toLowerCase();
              const searchText =
                option &&
                typeof option === "object" &&
                "searchText" in option &&
                typeof option.searchText === "string"
                  ? option.searchText
                  : "";
              return (
                label.includes(normalized) || searchText.includes(normalized)
              );
            }}
          />
        </Form.Item>
        <Form.Item
          label="Amount"
          name={["amount"]}
          rules={[
            { required: true },
            {
              validator: (_, value) =>
                value === null || value === undefined || value === 0
                  ? Promise.reject(new Error("Amount cannot be zero"))
                  : Promise.resolve(),
            },
          ]}
        >
          <InputNumber precision={2} style={{ width: "100%" }} />
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

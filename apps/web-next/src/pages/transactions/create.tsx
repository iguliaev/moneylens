import { useMemo } from "react";
import { Create, useForm, useSelect as useAntSelect } from "@refinedev/antd";
import { useSelect as useCoreSelect, useList } from "@refinedev/core";
import { Form, DatePicker, Select, InputNumber, Input } from "antd";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_OPTIONS,
  type TransactionType,
} from "../../constants/transactionTypes";
import { useTransactionForm } from "../../hooks";
import type { Category } from "../../utility/categoryHierarchy";
import {
  categoryLabel,
  categorySearchText,
  compareCategoriesByHierarchyLabel,
  isLeafCategory,
} from "../../utility/categoryHierarchy";

export const TransactionCreate = () => {
  const [searchParams] = useSearchParams();
  const initialType = useMemo(() => {
    const source = searchParams.get("source");
    const type = searchParams.get("type");
    const validTypes = new Set<TransactionType>(Object.values(TRANSACTION_TYPES));

    if (source !== "transactions-list") return undefined;
    if (!type || !validTypes.has(type as TransactionType)) return undefined;

    return type;
  }, [searchParams]);

  const { formProps, saveButtonProps } = useForm({
    warnWhenUnsavedChanges: false,
  });
  const { handleFinish, isLoading } = useTransactionForm({ mode: "create" });

  const type = Form.useWatch("type", formProps.form);

  const { result: categoriesResult } = useList<Category>({
    resource: "categories_with_usage",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
    filters: type ? [{ field: "type", operator: "eq", value: type }] : [],
    queryOptions: { enabled: !!type },
  });

  const leafCategoryOptions = (categoriesResult?.data ?? [])
    .filter(isLeafCategory)
    .sort(compareCategoriesByHierarchyLabel)
    .map((c: Category) => ({
      label: categoryLabel(c),
      value: c.id,
      searchText: categorySearchText(c),
    }));

  const { options: tagOptions, query: tagsQuery } = useCoreSelect({
    resource: "tags",
    optionLabel: "name",
    optionValue: "id",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const { selectProps: bankAccountSelectProps } = useAntSelect({
    resource: "bank_accounts",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  return (
    <Create saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
      <Form
        {...formProps}
        initialValues={initialType ? { type: initialType } : undefined}
        layout="vertical"
        onFinish={handleFinish}
      >
        <Form.Item
          label="Date"
          name={["date"]}
          rules={[{ required: true }]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="Type" name={["type"]} rules={[{ required: true }]}>
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
          rules={[{ required: true }]}
        >
          <Select
            options={leafCategoryOptions}
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
          rules={[{ required: true }]}
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
    </Create>
  );
};

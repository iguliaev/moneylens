import { useEffect, useMemo, useState } from "react";
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
import { useTransactionDefaults, useTransactionForm } from "../../hooks";
import {
  DATE_PICKER_INPUT_FORMATS,
  simpleLabelFilterOption,
  toDayjs,
  valueIfStillAvailable,
} from "../../utility";
import type { Category } from "../../utility/categoryHierarchy";
import {
  categoryFilterOption,
  toLeafCategoryOptions,
} from "../../utility/categoryHierarchy";

const VALID_TRANSACTION_TYPES = new Set<TransactionType>(
  Object.values(TRANSACTION_TYPES) as TransactionType[]
);

export const TransactionCreate = () => {
  const [searchParams] = useSearchParams();
  const typeFromUrl = useMemo<TransactionType | undefined>(() => {
    const source = searchParams.get("source");
    const rawType = searchParams.get("type");

    if (source !== "transactions-list") return undefined;
    if (!rawType || !VALID_TRANSACTION_TYPES.has(rawType as TransactionType))
      return undefined;

    return rawType as TransactionType;
  }, [searchParams]);

  const { formProps, saveButtonProps } = useForm({
    warnWhenUnsavedChanges: false,
  });
  const { handleFinish, isLoading } = useTransactionForm({ mode: "create" });
  const { defaultsByType, defaultType } = useTransactionDefaults();

  // The URL wins over the stored default: arriving from a typed list tab is an
  // explicit choice, the stored default is only a fallback.
  const initialType = typeFromUrl ?? defaultType ?? undefined;

  // Frozen at mount. A fresh object (or a fresh dayjs()) on later renders makes
  // antd re-seed the fields from it, which silently discards a date the user is
  // part-way through typing. Type is deliberately not in here — it can arrive
  // asynchronously with the stored default, so the effect below applies it.
  const [initialValues] = useState(() => ({ date: dayjs() }));

  const type = Form.useWatch("type", formProps.form);

  useEffect(() => {
    if (!initialType || !formProps.form) return;
    if (formProps.form.getFieldValue("type")) return;
    formProps.form.setFieldValue("type", initialType);
  }, [initialType, formProps.form]);

  const { result: categoriesResult } = useList<Category>({
    resource: "categories_with_usage",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
    filters: type ? [{ field: "type", operator: "eq", value: type }] : [],
    queryOptions: { enabled: !!type },
  });

  const leafCategoryOptions = useMemo(
    () => toLeafCategoryOptions(categoriesResult?.data ?? []),
    [categoriesResult?.data]
  );

  const { options: tagOptions, query: tagsQuery } = useCoreSelect({
    resource: "tags_with_usage",
    optionLabel: "name",
    optionValue: "id",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const { selectProps: bankAccountSelectProps } = useAntSelect({
    resource: "bank_accounts_with_usage",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  // Apply this type's defaults once the matching options have loaded, and only
  // into fields that are still empty — so this never overwrites a user's pick.
  // Only ids present in the loaded options are used: the views exclude
  // soft-deleted rows, so a stale default is silently skipped rather than
  // written back as an unresolvable value.
  useEffect(() => {
    const form = formProps.form;
    if (!form || !type) return;

    const defaults = defaultsByType[type as TransactionType];
    if (!defaults) return;

    const applyDefaultIfEmpty = (
      field: string,
      defaultId: string | null,
      options: readonly { value?: unknown }[]
    ) => {
      if (form.getFieldValue(field)) return;
      const value = valueIfStillAvailable(defaultId, options);
      if (value) form.setFieldValue(field, value);
    };

    applyDefaultIfEmpty("category_id", defaults.categoryId, leafCategoryOptions);
    applyDefaultIfEmpty(
      "bank_account_id",
      defaults.bankAccountId,
      bankAccountSelectProps.options ?? []
    );
  }, [
    type,
    defaultsByType,
    leafCategoryOptions,
    bankAccountSelectProps.options,
    formProps.form,
  ]);

  return (
    <Create saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
      <Form
        {...formProps}
        initialValues={initialValues}
        layout="vertical"
        onFinish={handleFinish}
      >
        <Form.Item
          label="Date"
          name={["date"]}
          rules={[{ required: true }]}
          getValueProps={(value) => ({ value: toDayjs(value) })}
        >
          <DatePicker format={DATE_PICKER_INPUT_FORMATS} />
        </Form.Item>
        <Form.Item label="Type" name={["type"]} rules={[{ required: true }]}>
          <Select
            options={TRANSACTION_TYPE_OPTIONS}
            onChange={() => {
              // Categories are type-specific, and the bank account default is
              // per-type too — clear both so the effect above refills them from
              // the newly selected type's defaults.
              formProps.form?.setFieldsValue({
                category_id: undefined,
                bank_account_id: undefined,
              });
            }}
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
            filterOption={categoryFilterOption}
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
            filterOption={simpleLabelFilterOption}
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

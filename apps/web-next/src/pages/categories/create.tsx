import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select } from "antd";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_OPTIONS,
} from "../../constants/transactionTypes";

export const CategoryCreate = () => {
  const [searchParams] = useSearchParams();
  const { formProps, saveButtonProps } = useForm();
  const initialType = useMemo<string | undefined>(() => {
    const validTypes = new Set<string>(Object.values(TRANSACTION_TYPES));
    const source = searchParams.get("source");
    const rawType = searchParams.get("type");

    if (source !== "categories-list") return undefined;
    if (!rawType || !validTypes.has(rawType)) {
      return undefined;
    }

    return rawType;
  }, [searchParams]);

  const mergedInitialValues = useMemo(() => {
    const existingInitialValues = formProps.initialValues ?? {};

    if (!initialType) {
      return Object.keys(existingInitialValues).length
        ? existingInitialValues
        : undefined;
    }

    return {
      ...existingInitialValues,
      type: initialType,
    };
  }, [formProps.initialValues, initialType]);

  const currentType = Form.useWatch("type", formProps.form) ?? initialType;

  const { selectProps: parentSelectProps } = useSelect({
    resource: "categories_with_usage",
    optionLabel: "name",
    optionValue: "id",
    sorters: [{ field: "name", order: "asc" }],
    filters: currentType
      ? [
          { field: "type", operator: "eq", value: currentType },
          { field: "parent_id", operator: "null", value: null },
        ]
      : [],
    queryOptions: { enabled: !!currentType },
    pagination: { pageSize: 200 },
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        initialValues={mergedInitialValues}
        layout="vertical"
        onValuesChange={(changed) => {
          if (changed.type !== undefined) {
            formProps.form?.setFieldValue("parent_id", undefined);
          }
        }}
      >
        <Form.Item label="Type" name={["type"]} rules={[{ required: true }]}>
          <Select options={TRANSACTION_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Name" name={["name"]} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name={["description"]}>
          <Input />
        </Form.Item>
        <Form.Item label="Parent Category" name={["parent_id"]}>
          <Select
            {...parentSelectProps}
            allowClear
            placeholder="No parent (top-level category)"
            disabled={!currentType}
          />
        </Form.Item>
      </Form>
    </Create>
  );
};

import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select } from "antd";
import { useState, useEffect } from "react";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";

export const CategoryEdit = () => {
  const { formProps, saveButtonProps, formLoading, id } = useForm();
  const [selectedType, setSelectedType] = useState<string | undefined>();

  // Sync selectedType when form data loads
  useEffect(() => {
    const type = formProps.form?.getFieldValue("type");
    if (type) setSelectedType(type);
  }, [formLoading, formProps.form]);

  const { selectProps: parentSelectProps } = useSelect({
    resource: "categories_with_usage",
    optionLabel: "name",
    optionValue: "id",
    filters: selectedType
      ? [
          { field: "type", operator: "eq", value: selectedType },
          { field: "parent_id", operator: "null", value: null },
        ]
      : [{ field: "type", operator: "eq", value: "__none__" }],
    pagination: { pageSize: 200 },
  });

  // Exclude self from parent options
  const filteredParentOptions = (parentSelectProps.options ?? []).filter(
    (opt) => opt.value !== id
  );

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
        data-testid="category-edit-form"
        aria-busy={formLoading}
        onValuesChange={(changed) => {
          if (changed.type !== undefined) {
            setSelectedType(changed.type);
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
            options={filteredParentOptions}
            allowClear
            placeholder="No parent (top-level category)"
          />
        </Form.Item>
      </Form>
    </Edit>
  );
};

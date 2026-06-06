import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select } from "antd";
import { useState } from "react";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";

export const CategoryCreate = () => {
  const { formProps, saveButtonProps } = useForm();
  const [selectedType, setSelectedType] = useState<string | undefined>();

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

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
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
            allowClear
            placeholder="No parent (top-level category)"
            disabled={!selectedType}
          />
        </Form.Item>
      </Form>
    </Create>
  );
};

import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Select } from "antd";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";

export const CategoryEdit = () => {
  const { formProps, saveButtonProps, query } = useForm();

  const categoriesData = query?.data?.data;

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Type"
          name={["type"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select options={TRANSACTION_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="Name"
          name={["name"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Description" name={["description"]}>
          <Input />
        </Form.Item>
      </Form>
    </Edit>
  );
};

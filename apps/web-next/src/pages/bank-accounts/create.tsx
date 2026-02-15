import { Create, useForm } from "@refinedev/antd";
import { Form, Input } from "antd";

export const BankAccountCreate = () => {
  const { formProps, saveButtonProps, query } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
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
    </Create>
  );
};

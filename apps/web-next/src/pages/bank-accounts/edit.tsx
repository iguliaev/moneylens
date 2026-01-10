import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, DatePicker } from "antd";

export const BankAccountEdit = () => {
  const { formProps, saveButtonProps, query } = useForm();

  const bankAccountsData = query?.data?.data;

  return (
    <Edit saveButtonProps={saveButtonProps}>
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
    </Edit>
  );
};

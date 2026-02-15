import { Edit, useForm } from "@refinedev/antd";
import { Form, Input } from "antd";

export const BankAccountEdit = () => {
  const { formProps, saveButtonProps, query } = useForm();

  const isLoading = query?.isLoading ?? false;

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
        data-testid="bank-account-edit-form"
        aria-busy={isLoading}
      >
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

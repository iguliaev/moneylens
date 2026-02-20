import { Edit, useForm } from "@refinedev/antd";
import { Form, Input } from "antd";

export const TagEdit = () => {
  const { formProps, saveButtonProps, formLoading } = useForm();

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
        data-testid="tag-edit-form"
        aria-busy={formLoading}
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

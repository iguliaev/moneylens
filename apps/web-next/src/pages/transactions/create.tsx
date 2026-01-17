import React from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select } from "antd";
import dayjs from "dayjs";

export const TransactionCreate = () => {
    const { formProps, saveButtonProps, query } = useForm();

    const { selectProps: categorySelectProps } = useSelect({
        resource: "categories",
        optionLabel: "name",
    });

    const { selectProps: tagsSelectProps } = useSelect({
        resource: "tags",
    });

    const { selectProps: bankAccountSelectProps } = useSelect({
        resource: "bank_accounts",
        optionLabel: "name",
    });

    return (
        <Create saveButtonProps={saveButtonProps}>
            <Form {...formProps} layout="vertical">
                <Form.Item
                    label="Date"
                    name={["date"]}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                    getValueProps={(value) => ({
                        value: value ? dayjs(value) : undefined,
                    })}
                >
                    <DatePicker />
                </Form.Item>
                <Form.Item
                    label="Type"
                    name={["type"]}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label="Category"
                    name={"category_id"}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <Select {...categorySelectProps} />
                </Form.Item>
                <Form.Item
                    label="Amount"
                    name={["amount"]}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label="Tags"
                    name={"tags"}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <Select mode="multiple" {...tagsSelectProps} />
                </Form.Item>
                <Form.Item
                    label="Created At"
                    name={["created_at"]}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                    getValueProps={(value) => ({
                        value: value ? dayjs(value) : undefined,
                    })}
                >
                    <DatePicker />
                </Form.Item>
                <Form.Item
                    label="Updated At"
                    name={["updated_at"]}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                    getValueProps={(value) => ({
                        value: value ? dayjs(value) : undefined,
                    })}
                >
                    <DatePicker />
                </Form.Item>
                <Form.Item
                    label="Bank Account"
                    name={"bank_account_id"}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <Select {...bankAccountSelectProps} />
                </Form.Item>
            </Form>
        </Create>
    );
};


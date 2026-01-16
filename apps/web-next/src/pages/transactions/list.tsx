import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  useSelect,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
  DateField,
  TagField,
  FilterDropdown,
  getDefaultFilter,
  type MapValueEvent,
} from "@refinedev/antd";
import { Table, Space, Segmented, Select, DatePicker, InputNumber } from "antd";
import type { FilterDropdownProps } from "antd/lib/table/interface";
import { useState } from "react";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from "../../constants/transactionTypes";

/**
 * Custom date range filter mapper that outputs date-only strings (YYYY-MM-DD)
 * instead of ISO timestamps to avoid timezone conversion issues.
 * Use this for DATE columns (not TIMESTAMP) in the database.
 */
const dateOnlyFilterMapper = (
  selectedKeys: React.Key[],
  event: MapValueEvent
) => {
  if (!selectedKeys || selectedKeys.length === 0) {
    return selectedKeys;
  }

  // "value" event: convert strings back to Dayjs for the DatePicker
  if (event === "value") {
    return selectedKeys.map((key) => {
      if (typeof key === "string") {
        return dayjs(key);
      }
      return key;
    });
  }

  // "onChange" event: convert Dayjs to date-only strings (no timezone shift)
  if (event === "onChange") {
    if (selectedKeys.every(dayjs.isDayjs)) {
      return selectedKeys.map((date: any) => date.format("YYYY-MM-DD"));
    }
  }

  return selectedKeys;
};

export const TransactionList = () => {
  const invalidate = useInvalidate();
  const [transactionType, setTransactionType] = useState<string>(
    TRANSACTION_TYPES.SPEND
  );

  const { tableProps, filters } = useTable({
    syncWithLocation: true,
    resource: "transactions_with_details",
    filters: {
      permanent: [
        {
          field: "type",
          operator: "eq",
          value: transactionType,
        },
      ],
    },
  });

  // Category select - filtered by current transaction type
  const { selectProps: categorySelectProps } = useSelect({
    resource: "categories",
    optionLabel: "name",
    optionValue: "id",
    filters: [
      {
        field: "type",
        operator: "eq",
        value: transactionType,
      },
    ],
    sorters: [
      {
        field: "name",
        order: "asc",
      },
    ],
    pagination: {
      mode: "off",
    },
    defaultValue: getDefaultFilter("category_id", filters, "in"),
  });

  // Bank account select
  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    optionLabel: "name",
    optionValue: "id",
    sorters: [
      {
        field: "name",
        order: "asc",
      },
    ],
    pagination: {
      mode: "off",
    },
    defaultValue: getDefaultFilter("bank_account_id", filters, "in"),
  });

  // Tags select
  // Note: For "any of these tags" filtering, Supabase uses 'ov' (overlaps) operator
  // The data provider may need customization to handle array overlap queries
  const { selectProps: tagSelectProps } = useSelect({
    resource: "tags",
    optionLabel: "name",
    optionValue: "id",
    sorters: [
      {
        field: "name",
        order: "asc",
      },
    ],
    pagination: {
      mode: "off",
    },
    defaultValue: getDefaultFilter("tag_ids", filters, "in"),
  });

  return (
    <List>
      <Segmented
        options={Object.values(TRANSACTION_TYPES).map((type) => ({
          label: TRANSACTION_TYPE_LABELS[type],
          value: type,
        }))}
        value={transactionType}
        onChange={(value) => setTransactionType(value as string)}
      />
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex={["date"]}
          title="Date"
          sorter
          render={(value: any) => <DateField value={value} />}
          filterDropdown={(props: FilterDropdownProps) => (
            <FilterDropdown {...props} mapValue={dateOnlyFilterMapper}>
              <DatePicker.RangePicker />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("date", filters, "between")}
        />
        <Table.Column
          key="category_id"
          dataIndex="category_name"
          title="Category"
          sorter
          filterDropdown={(props: FilterDropdownProps) => (
            <FilterDropdown {...props}>
              <Select
                mode="multiple"
                placeholder="Select categories"
                style={{ minWidth: 200 }}
                {...categorySelectProps}
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("category_id", filters, "in")}
        />
        <Table.Column
          dataIndex="amount"
          title="Amount"
          sorter
          filterDropdown={(props: FilterDropdownProps) => (
            <FilterDropdown {...props}>
              <InputNumber
                placeholder="Filter by amount"
                style={{ width: "100%" }}
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("amount", filters, "eq")}
        />
        <Table.Column
          key="tag_ids"
          dataIndex="tag_names"
          title="Tags"
          render={(value: string[]) => (
            <>
              {value?.map((tagName, index) => (
                <TagField key={index} value={tagName} />
              ))}
            </>
          )}
          filterDropdown={(props: FilterDropdownProps) => (
            <FilterDropdown {...props}>
              <Select
                mode="multiple"
                placeholder="Select tags"
                style={{ minWidth: 200 }}
                {...tagSelectProps}
              />
            </FilterDropdown>
          )}
          // Note: tag_ids is an array column; for "any of these tags" logic,
          // Supabase 'ov' (overlaps) operator may be needed in the data provider
          defaultFilteredValue={getDefaultFilter("tag_ids", filters, "in")}
        />
        <Table.Column
          key="bank_account_id"
          dataIndex="bank_account_name"
          title="Bank Account"
          sorter
          filterDropdown={(props: FilterDropdownProps) => (
            <FilterDropdown {...props}>
              <Select
                mode="multiple"
                placeholder="Select bank accounts"
                style={{ minWidth: 200 }}
                {...bankAccountSelectProps}
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter(
            "bank_account_id",
            filters,
            "in"
          )}
        />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
              <DeleteButton
                hideText
                size="small"
                recordItemId={record.id}
                resource="transactions"
                onSuccess={() => {
                  invalidate({
                    resource: "transactions_with_details",
                    invalidates: ["list"],
                  });
                }}
              />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

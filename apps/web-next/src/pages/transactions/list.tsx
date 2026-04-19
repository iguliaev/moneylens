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
} from "@refinedev/antd";
import { Table, Space, Segmented, Select, DatePicker, InputNumber } from "antd";
import { useState } from "react";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from "../../constants/transactionTypes";
import { formatAmount } from "../../utility";

const commonSelectOptions = {
  sorters: [{ field: "name", order: "asc" as const }],
  pagination: { mode: "off" as const },
};

/** Reusable multi-select filter dropdown - forwards FilterDropdown's onChange/value */
const MultiSelectFilter = ({
  placeholder,
  selectProps,
  onChange,
  value,
}: {
  placeholder: string;
  selectProps: ReturnType<typeof useSelect>["selectProps"];
  onChange?: (value: unknown) => void;
  value?: unknown;
}) => (
  <Select
    mode="multiple"
    placeholder={placeholder}
    style={{ minWidth: 200 }}
    options={selectProps.options}
    loading={selectProps.loading}
    onChange={onChange}
    value={value}
  />
);

export const TransactionList = () => {
  const invalidate = useInvalidate();
  const [transactionType, setTransactionType] = useState<string>(
    TRANSACTION_TYPES.SPEND
  );

  const { tableProps, filters, setFilters } = useTable({
    syncWithLocation: true,
    resource: "transactions_with_details",
    sorters: {
      initial: [{ field: "date", order: "desc" }],
    },
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
    filters: [{ field: "type", operator: "eq", value: transactionType }],
    ...commonSelectOptions,
    defaultValue: getDefaultFilter("category_id", filters, "in"),
  });

  // Bank account select
  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    optionLabel: "name",
    optionValue: "id",
    ...commonSelectOptions,
    defaultValue: getDefaultFilter("bank_account_id", filters, "in"),
  });

  // Tags select
  const { selectProps: tagSelectProps } = useSelect({
    resource: "tags",
    optionLabel: "name",
    optionValue: "id",
    ...commonSelectOptions,
    defaultValue: getDefaultFilter("tag_ids", filters, "in"),
  });

  return (
    <List>
      <Segmented
        aria-label="segmented control"
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
          render={(value: string) => <DateField value={value} />}
          filteredValue={getDefaultFilter("date", filters, "between") ?? null}
          filterDropdown={({ confirm }) => {
            const activeVal = getDefaultFilter("date", filters, "between");
            const value =
              Array.isArray(activeVal) && activeVal.length === 2
                ? ([dayjs(activeVal[0] as string), dayjs(activeVal[1] as string)] as [dayjs.Dayjs, dayjs.Dayjs])
                : undefined;
            return (
              <div style={{ padding: 8 }}>
                <DatePicker.RangePicker
                  value={value}
                  onChange={(dates) => {
                    setFilters([{
                      field: "date",
                      operator: "between",
                      value: dates?.[0] && dates?.[1]
                        ? [dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")]
                        : undefined,
                    }]);
                    confirm({ closeDropdown: true });
                  }}
                />
              </div>
            );
          }}
        />
        <Table.Column
          key="category_id"
          dataIndex="category_name"
          title="Category"
          sorter
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <MultiSelectFilter
                placeholder="Select categories"
                selectProps={categorySelectProps}
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("category_id", filters, "in")}
        />
        <Table.Column
          dataIndex="amount"
          title="Amount"
          sorter
          render={(value: number) => formatAmount(value)}
          filterDropdown={(props) => (
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
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <MultiSelectFilter
                placeholder="Select tags"
                selectProps={tagSelectProps}
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("tag_ids", filters, "in")}
        />
        <Table.Column
          key="bank_account_id"
          dataIndex="bank_account_name"
          title="Bank Account"
          sorter
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <MultiSelectFilter
                placeholder="Select bank accounts"
                selectProps={bankAccountSelectProps}
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
          key="notes"
          dataIndex="notes"
          title="Notes"
          render={(value: string) => value || ""}
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

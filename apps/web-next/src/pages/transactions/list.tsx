import { BaseRecord, useInvalidate } from "@refinedev/core";
import {
  useTable,
  useSelect,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
  TagField,
  FilterDropdown,
  getDefaultFilter,
} from "@refinedev/antd";
import {
  Table,
  Space,
  Segmented,
  Select,
  DatePicker,
  InputNumber,
  Button,
} from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from "../../constants/transactionTypes";
import { formatAmount, DATE_PICKER_INPUT_FORMATS } from "../../utility";
import { formatDisplayDate } from "../../utility/dateDisplay";
import { useTransactionEmptyState, TableSkeleton } from "../../components";

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
  const navigate = useNavigate();

  const { tableProps, filters, setFilters, setCurrentPage } = useTable({
    syncWithLocation: true,
    resource: "transactions_with_details",
    sorters: {
      initial: [{ field: "date", order: "desc" }],
    },
    filters: {
      initial: [
        { field: "type", operator: "eq", value: TRANSACTION_TYPES.SPEND },
      ],
    },
  });
  const transactionType =
    (getDefaultFilter("type", filters, "eq") as string) ??
    TRANSACTION_TYPES.SPEND;

  // Category select - filtered by current transaction type
  const { selectProps: categorySelectProps } = useSelect({
    resource: "categories_with_usage",
    optionLabel: (item: BaseRecord) => {
      const name = typeof item.name === "string" ? item.name : "";
      const parentName =
        typeof item.parent_name === "string" ? item.parent_name : null;
      return parentName ? `${parentName} / ${name}` : name;
    },
    optionValue: (item: BaseRecord) => String(item.id),
    filters: [{ field: "type", operator: "eq", value: transactionType }],
    ...commonSelectOptions,
    defaultValue: getDefaultFilter("category_id", filters, "in"),
  });
  const sortedCategoryOptions = [...(categorySelectProps.options ?? [])].sort(
    (a, b) =>
      String(a?.label ?? "").localeCompare(String(b?.label ?? ""), undefined, {
        sensitivity: "base",
      })
  );

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

  // Always call to keep React hook call count consistent (internally calls useNavigation())
  const transactionEmptyState = useTransactionEmptyState();

  return (
    <List
      headerButtons={() => (
        <Button
          type="primary"
          onClick={() => {
            const params = new URLSearchParams({
              source: "transactions-list",
              type: transactionType,
            });
            navigate(`/transactions/create?${params.toString()}`);
          }}
        >
          Create
        </Button>
      )}
    >
      <Segmented
        aria-label="segmented control"
        options={Object.values(TRANSACTION_TYPES).map((type) => ({
          label: TRANSACTION_TYPE_LABELS[type],
          value: type,
        }))}
        value={transactionType}
        onChange={(value) => {
          const nextType = value as string;
          if (nextType === transactionType) return;
          setCurrentPage(1);
          setFilters(
            [{ field: "type", operator: "eq", value: nextType }],
            "replace"
          );
        }}
      />
      {tableProps.loading && !tableProps.dataSource?.length ? (
        <TableSkeleton columns={7} />
      ) : (
        <Table
          {...tableProps}
          rowKey="id"
          locale={{ emptyText: transactionEmptyState }}
        >
          <Table.Column
            dataIndex={["date"]}
            title="Date"
            sorter
            render={(value: string) => formatDisplayDate(value)}
            filteredValue={getDefaultFilter("date", filters, "between") ?? null}
            filterDropdown={({ confirm }) => {
              const activeVal = getDefaultFilter("date", filters, "between");
              const value =
                Array.isArray(activeVal) && activeVal.length === 2
                  ? ([
                      dayjs(activeVal[0] as string),
                      dayjs(activeVal[1] as string),
                    ] as [dayjs.Dayjs, dayjs.Dayjs])
                  : undefined;
              return (
                <div style={{ padding: 8 }}>
                  <DatePicker.RangePicker
                    format={DATE_PICKER_INPUT_FORMATS}
                    value={value}
                    onChange={(dates) => {
                      setFilters([
                        {
                          field: "date",
                          operator: "between",
                          value:
                            dates?.[0] && dates?.[1]
                              ? [
                                  dates[0].format("YYYY-MM-DD"),
                                  dates[1].format("YYYY-MM-DD"),
                                ]
                              : undefined,
                        },
                      ]);
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
            render={(_: unknown, record: BaseRecord) => {
              const parentName = record.category_parent_name as string | null;
              const childName = record.category_name as string | null;
              return parentName && childName
                ? `${parentName} / ${childName}`
                : (childName ?? "—");
            }}
            filterDropdown={(props) => (
              <FilterDropdown {...props}>
                <MultiSelectFilter
                  placeholder="Select categories"
                  selectProps={{
                    ...categorySelectProps,
                    options: sortedCategoryOptions,
                  }}
                />
              </FilterDropdown>
            )}
            filteredValue={
              getDefaultFilter("category_id", filters, "in") ?? null
            }
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
            filteredValue={getDefaultFilter("amount", filters, "eq") ?? null}
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
            filteredValue={getDefaultFilter("tag_ids", filters, "in") ?? null}
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
            filteredValue={
              getDefaultFilter("bank_account_id", filters, "in") ?? null
            }
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
      )}
    </List>
  );
};

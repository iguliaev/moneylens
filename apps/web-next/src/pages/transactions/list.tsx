import {
  BaseRecord,
  useInvalidate,
  type CrudFilters,
  type CrudSort,
  type ConditionalFilter,
  type LogicalFilter,
} from "@refinedev/core";
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
  mapAntdSorterToCrudSorting,
} from "@refinedev/antd";
import {
  Table,
  Space,
  Segmented,
  Select,
  DatePicker,
  InputNumber,
  Button,
  theme,
  type TableProps,
} from "antd";
import { FilterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from "../../constants/transactionTypes";
import { formatAmount, DATE_PICKER_INPUT_FORMATS } from "../../utility";
import { formatDisplayDate } from "../../utility/dateDisplay";
import { useTransactionEmptyState, TableSkeleton } from "../../components";

const DEFAULT_SORTERS: CrudSort[] = [{ field: "date", order: "desc" }];

// Without a fully-deterministic ORDER BY, successive LIMIT/OFFSET pages over
// a set of rows that tie on the active sort field (several transactions
// sharing a date, say) aren't guaranteed to be consistent with each other,
// so a tied row can be skipped or duplicated between pages — it then appears
// to vanish at one page size but not another (production bug 2026-08-24,
// fixed in #274; regression test: transactions.spec.ts "every transaction on
// a tied sort date appears exactly once…"). Append `created_at, id` as final
// sort keys on every query: `created_at` keeps same-date rows newest-first
// (matching the `date desc` default), and `id` (the table's PK) guarantees a
// total order so pagination is deterministic whatever column is sorted on.
const TIE_BREAKER_FIELDS = ["created_at", "id"] as const;
type TieBreakerField = (typeof TIE_BREAKER_FIELDS)[number];

const hasTieBreaker = (sorters: CrudSort[]): boolean =>
  sorters.some((s) => TIE_BREAKER_FIELDS.includes(s.field as TieBreakerField));

const withTieBreakers = (sorters: CrudSort[]): CrudSort[] => {
  const primary = sorters.filter(
    (s) => !TIE_BREAKER_FIELDS.includes(s.field as TieBreakerField)
  );
  // A cleared sort (AntD's 3rd header click yields an empty sorter) falls
  // back to the default `date desc` view rather than a bare tie-breaker
  // order — `id` is a random UUID, so `id`-only would shuffle the list.
  const base = primary.length > 0 ? primary : DEFAULT_SORTERS;
  const order = base[0].order;
  return [...base, ...TIE_BREAKER_FIELDS.map((field) => ({ field, order }))];
};

const commonSelectOptions = {
  sorters: [{ field: "name", order: "asc" as const }],
  pagination: { mode: "off" as const },
};

// tag_ids is a uuid[] computed column, so multi-tag filtering can't use the
// default "in" operator (a scalar-list comparison against an array column).
// Instead we build an explicit OR-of-"contains" filter — "has tag1 OR tag2"
// — keyed separately from the field so refine's own filteredValue/"in"
// machinery never touches it (it explicitly skips or/and filters).
const TAG_IDS_OR_KEY = "tag_ids_or";

function buildTagIdsOrFilter(tagIds: string[]): ConditionalFilter {
  return {
    key: TAG_IDS_OR_KEY,
    operator: "or",
    value: tagIds.map((tagId) => ({
      field: "tag_ids",
      operator: "ina",
      value: [tagId],
    })),
  };
}

function getTagIdsFilterValue(filters: CrudFilters): string[] {
  const orFilter = filters.find(
    (f): f is ConditionalFilter =>
      f.operator === "or" && "key" in f && f.key === TAG_IDS_OR_KEY
  );
  if (!orFilter) return [];
  return orFilter.value
    .filter((f): f is LogicalFilter => "field" in f && f.field === "tag_ids")
    .flatMap((f) => f.value as string[]);
}

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

/**
 * Fully custom filter dropdown for tag_ids — never calls antd's own
 * setSelectedKeys/confirm, since that would let refine's default "in"
 * mapping race with the "or" filter this manages via setFilters directly.
 */
const TagsFilterDropdown = ({
  close,
  filters,
  setFilters,
  selectProps,
}: {
  close: () => void;
  filters: CrudFilters;
  setFilters: (filters: CrudFilters) => void;
  selectProps: ReturnType<typeof useSelect>["selectProps"];
}) => {
  const [pending, setPending] = useState<string[]>(() =>
    getTagIdsFilterValue(filters)
  );

  const applyFilter = (tagIds: string[]) => {
    setFilters([buildTagIdsOrFilter(tagIds)]);
    close();
  };

  return (
    <div
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      <div style={{ marginBottom: 15 }}>
        <MultiSelectFilter
          placeholder="Select tags"
          selectProps={selectProps}
          value={pending}
          onChange={(value) => setPending(value as string[])}
        />
      </div>
      <Space>
        <Button
          type="primary"
          size="small"
          onClick={() => applyFilter(pending)}
        >
          <FilterOutlined /> Filter
        </Button>
        <Button
          danger
          size="small"
          onClick={() => {
            setPending([]);
            applyFilter([]);
          }}
        >
          Clear
        </Button>
      </Space>
    </div>
  );
};

const { useToken } = theme;

export const TransactionList = () => {
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const { token } = useToken();

  const {
    tableProps,
    filters,
    setFilters,
    setCurrentPage,
    sorters,
    setSorters,
  } = useTable({
    syncWithLocation: true,
    resource: "transactions_with_details",
    sorters: {
      initial: withTieBreakers(DEFAULT_SORTERS),
    },
    filters: {
      initial: [
        { field: "type", operator: "eq", value: TRANSACTION_TYPES.SPEND },
      ],
    },
  });

  // Interactive sort changes are normalized in `handleTableChange` before
  // they ever reach `setSorters`. This effect only covers the one path that
  // bypasses both `initial` and `onChange`: `syncWithLocation` restoring
  // `sorters` straight from a URL saved before the tie-breaker existed (an
  // old reload or shared link). It converges in one pass — once the
  // tie-breaker is appended, `hasTieBreaker` is true and it's a no-op.
  useEffect(() => {
    if (sorters.length > 0 && !hasTieBreaker(sorters)) {
      setSorters(withTieBreakers(sorters));
    }
  }, [sorters, setSorters]);

  // AntD re-emits the full sorter state on every column-header click, but it
  // only knows about the visible columns — never `created_at`/`id` — so
  // refine's own `onChange` would call `setSorters` without the tie-breaker
  // and fire one non-deterministic paginated query before anything could
  // correct it. Intercept the sort action and inject the tie-breaker
  // synchronously; delegate paginate/filter actions to refine untouched.
  const handleTableChange: NonNullable<TableProps<BaseRecord>["onChange"]> = (
    pagination,
    tableFilters,
    sorter,
    extra
  ) => {
    if (extra.action === "sort") {
      setSorters(withTieBreakers(mapAntdSorterToCrudSorting(sorter)));
      return;
    }
    tableProps.onChange?.(pagination, tableFilters, sorter, extra);
  };
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
    resource: "bank_accounts_with_usage",
    optionLabel: "name",
    optionValue: "id",
    ...commonSelectOptions,
    defaultValue: getDefaultFilter("bank_account_id", filters, "in"),
  });

  // Tags select
  const { selectProps: tagSelectProps } = useSelect({
    resource: "tags_with_usage",
    optionLabel: "name",
    optionValue: "id",
    ...commonSelectOptions,
    defaultValue: getTagIdsFilterValue(filters),
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
          onChange={handleTableChange}
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
            filterIcon={() => (
              <FilterOutlined
                style={{
                  color: getTagIdsFilterValue(filters).length
                    ? token.colorPrimary
                    : undefined,
                }}
              />
            )}
            filterDropdown={({ close }) => (
              <TagsFilterDropdown
                close={close}
                filters={filters}
                setFilters={setFilters}
                selectProps={tagSelectProps}
              />
            )}
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

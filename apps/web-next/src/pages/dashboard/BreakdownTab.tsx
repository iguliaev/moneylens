import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Segmented,
  Skeleton,
  Switch,
  Table,
  Typography,
} from "antd";
import { UnorderedListOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate } from "react-router";
import { useCurrency } from "../../contexts/currency";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
  TYPE_VALUE_COLORS,
  type TransactionType,
} from "../../constants/transactionTypes";
import { useBreakdown, useBreakdownMonthly } from "../../hooks";
import { formatCurrency } from "../../utility/currency";
import { DATE_PICKER_INPUT_FORMATS } from "../../utility/datePickerFormats";
import type { BreakdownDimension } from "../../utility/rpc";
import {
  breakdownRowKey,
  breakdownRowPath,
  coversPartialMonths,
  defaultBreakdownRange,
  isValidBreakdownRange,
  type BreakdownRow,
} from "../../utility/breakdown";
import { BreakdownMonthlyChart } from "./components/BreakdownMonthlyChart";

const { Text } = Typography;
const { RangePicker } = DatePicker;

const DIMENSION_LABELS: Record<BreakdownDimension, string> = {
  category: "Category",
  tag: "Tag",
  bank_account: "Bank account",
};

export const BreakdownTab = () => {
  const { currency } = useCurrency();
  const navigate = useNavigate();

  const [dimension, setDimension] = useState<BreakdownDimension>("category");
  const [type, setType] = useState<TransactionType>(TRANSACTION_TYPES.SPEND);
  const [[start, end], setRange] = useState<[string, string]>(
    defaultBreakdownRange
  );
  const [groupByParent, setGroupByParent] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const validRange = isValidBreakdownRange(start, end);
  // Grouping only means something for categories; other dimensions ignore it.
  const args = {
    dimension,
    type,
    start,
    end,
    groupByParent: dimension === "category" && groupByParent,
  };

  const { rows, loading, error } = useBreakdown(args, validRange);
  const selected = rows.find((r) => breakdownRowKey(r) === selectedKey);
  const monthly = useBreakdownMonthly(
    args,
    selected?.entityId ?? null,
    validRange && selected !== undefined
  );

  // Changing anything that changes the rows clears the selection.
  const resetSelection = () => setSelectedKey(null);

  const maxTotal = Math.max(0, ...rows.map((r) => r.total));
  const typeLabel = TRANSACTION_TYPE_LABELS[type].toLowerCase();
  const valueColor = TYPE_VALUE_COLORS[type];

  return (
    <div
      data-testid="breakdown-tab"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
        }}
      >
        <Segmented
          aria-label="Breakdown dimension"
          options={Object.entries(DIMENSION_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
          value={dimension}
          onChange={(value) => {
            setDimension(value as BreakdownDimension);
            resetSelection();
          }}
        />
        <Segmented
          aria-label="Breakdown type"
          options={Object.values(TRANSACTION_TYPES).map((t) => ({
            value: t,
            label: TRANSACTION_TYPE_LABELS[t],
          }))}
          value={type}
          onChange={(value) => {
            setType(value as TransactionType);
            resetSelection();
          }}
        />
        <RangePicker
          aria-label="Breakdown period"
          allowClear={false}
          format={DATE_PICKER_INPUT_FORMATS}
          value={[dayjs(start), dayjs(end)]}
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              setRange([
                dates[0].format("YYYY-MM-DD"),
                dates[1].format("YYYY-MM-DD"),
              ]);
              resetSelection();
            }
          }}
        />
        {dimension === "category" && (
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Switch
              checked={groupByParent}
              onChange={(checked) => {
                setGroupByParent(checked);
                resetSelection();
              }}
            />
            Group by parent
          </label>
        )}
      </div>

      {!validRange && (
        <Alert
          type="warning"
          showIcon
          message="Choose a period where the end date is on or after the start date."
        />
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load the breakdown"
          description={error.message}
        />
      )}

      {dimension === "tag" && (
        <Alert
          type="info"
          showIcon
          message="A transaction with several tags counts toward each of them, so these rows do not add up to a total. Untagged transactions are not listed."
        />
      )}

      {validRange && loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : validRange && !error && rows.length === 0 ? (
        <Text type="secondary">No {typeLabel} transactions in this period</Text>
      ) : (
        validRange &&
        !error && (
          <Table<BreakdownRow>
            size="small"
            rowKey={breakdownRowKey}
            dataSource={rows}
            pagination={false}
            onRow={(row) => ({
              onClick: () =>
                setSelectedKey((prev) =>
                  prev === breakdownRowKey(row) ? null : breakdownRowKey(row)
                ),
              style: { cursor: "pointer" },
            })}
            rowClassName={(row) =>
              breakdownRowKey(row) === selectedKey
                ? "ant-table-row-selected"
                : ""
            }
          >
            <Table.Column<BreakdownRow>
              title={DIMENSION_LABELS[dimension]}
              render={(_, row) =>
                row.parentName ? `${row.parentName} / ${row.name}` : row.name
              }
            />
            <Table.Column<BreakdownRow>
              title="Total"
              align="right"
              width={280}
              render={(_, row) => (
                <div style={{ position: "relative", minWidth: 200 }}>
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${maxTotal > 0 ? (row.total / maxTotal) * 100 : 0}%`,
                      background: valueColor,
                      opacity: 0.15,
                      borderRadius: 2,
                    }}
                  />
                  <span style={{ position: "relative", padding: "0 4px" }}>
                    {formatCurrency(row.total, currency)}
                  </span>
                </div>
              )}
            />
            <Table.Column<BreakdownRow>
              title="Transactions"
              dataIndex="txCount"
              align="right"
              width={120}
            />
            <Table.Column<BreakdownRow>
              title=""
              width={56}
              render={(_, row) => {
                const path = breakdownRowPath(dimension, type, start, end, row);
                return (
                  <Button
                    size="small"
                    icon={<UnorderedListOutlined />}
                    aria-label="View transactions"
                    title={
                      path
                        ? "View transactions"
                        : "There is nothing to filter on for this row"
                    }
                    href={path ?? undefined}
                    disabled={!path}
                    onClick={(event) => {
                      // Don't also toggle the row's selection.
                      event.stopPropagation();
                      if (
                        !path ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey
                      )
                        return;
                      event.preventDefault();
                      navigate(path);
                    }}
                  />
                );
              }}
            />
          </Table>
        )
      )}

      {selected && (
        <Card
          size="small"
          title={`${
            selected.parentName
              ? `${selected.parentName} / ${selected.name}`
              : selected.name
          } — by month`}
        >
          {monthly.error ? (
            <Alert
              type="error"
              showIcon
              message="Failed to load the monthly totals"
              description={monthly.error.message}
            />
          ) : monthly.loading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : (
            <>
              <BreakdownMonthlyChart
                series={monthly.series}
                color={valueColor}
                currency={currency}
              />
              {coversPartialMonths(start, end) && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  The first and last months include only the days inside the
                  chosen period.
                </Text>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
};

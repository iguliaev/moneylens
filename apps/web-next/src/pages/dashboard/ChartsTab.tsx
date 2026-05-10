import { useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Segmented, Select, Typography } from "antd";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import dayjs from "dayjs";
import { useCurrency } from "../../contexts/currency";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TYPE_VALUE_COLORS,
  TransactionType,
} from "../../constants/transactionTypes";
import {
  getMonthKeysInRange,
  formatMonthLabel,
} from "../../utility/monthHelpers";
import { useChartsData } from "../../hooks";
import type {
  TrendPoint,
  CategorySpendPoint,
  TagSpendPoint,
} from "../../hooks";
import { TrendChart } from "./components/TrendChart";

const { Text, Title } = Typography;

// === Constants ===
const CHART_COLORS = [
  "#1677ff",
  "#52c41a",
  "#ff4d4f",
  "#fa8c16",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#fadb14",
];

const currentYear = dayjs().year();
const yearOptions = Array.from({ length: 6 }, (_, i) => ({
  label: String(currentYear - i),
  value: currentYear - i,
}));
const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  label: dayjs().month(i).format("MMM"),
  value: i,
}));

// === Sub-components ===

const CurrencyTooltipFormatter =
  (currency: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (value: any): string => {
    const n = typeof value === "number" ? value : 0;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(n);
  };


const SpendingTrendlineChart = ({
  categorySpendByMonth,
  tagSpendByMonth,
  startDate,
  endDate,
  currency,
}: {
  categorySpendByMonth: CategorySpendPoint[];
  tagSpendByMonth: TagSpendPoint[];
  startDate: string;
  endDate: string;
  currency: string;
}) => {
  const { Text } = Typography;
  const [mode, setMode] = useState<"category" | "tag">("category");
  const [selected, setSelected] = useState<string[]>([]);
  const fmt = CurrencyTooltipFormatter(currency);

  const itemPool = useMemo(() => {
    const totals: Record<string, number> = {};
    if (mode === "category") {
      for (const p of categorySpendByMonth)
        totals[p.category] = (totals[p.category] ?? 0) + p.total;
    } else {
      for (const p of tagSpendByMonth)
        totals[p.tag] = (totals[p.tag] ?? 0) + p.total;
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }, [mode, categorySpendByMonth, tagSpendByMonth]);

  useEffect(() => {
    setSelected(itemPool.slice(0, 5));
  }, [itemPool]);

  const { chartData, hasData } = useMemo(() => {
    const itemByMonth: Record<string, Record<string, number>> = {}; // item -> monthKey -> total
    const points = mode === "category" ? categorySpendByMonth : tagSpendByMonth;

    for (const p of points) {
      const key =
        mode === "category"
          ? (p as CategorySpendPoint).category
          : (p as TagSpendPoint).tag;
      if (!itemByMonth[key]) itemByMonth[key] = {};
      itemByMonth[key][p.monthKey] =
        (itemByMonth[key][p.monthKey] ?? 0) + p.total;
    }

    const monthKeysInRange = getMonthKeysInRange(startDate, endDate);
    const hasData = selected.some((item) =>
      Object.values(itemByMonth[item] ?? {}).some((total) => total !== 0)
    );

    const chartData = monthKeysInRange.map((monthKey) => {
      const row: Record<string, string | number> = {
        month: formatMonthLabel(`${monthKey}-01`),
      };
      // Use safe keys (k0, k1, …) instead of raw names to avoid Recharts
      // path-resolver treating dots/brackets in names as nested accessors.
      for (let i = 0; i < selected.length; i++) {
        row[`k${i}`] = itemByMonth[selected[i]]?.[monthKey] ?? 0;
      }
      return row;
    });

    return { chartData, hasData };
  }, [
    categorySpendByMonth,
    endDate,
    mode,
    selected,
    startDate,
    tagSpendByMonth,
  ]);

  const label = mode === "category" ? "categories" : "tags";

  return (
    <Card title="Spending Trendline">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <Segmented
          options={["Category", "Tag"]}
          value={mode === "category" ? "Category" : "Tag"}
          onChange={(v) => setMode(v === "Category" ? "category" : "tag")}
        />
        <Select
          mode="multiple"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={`Select ${label}`}
          options={itemPool.map((k) => ({ label: k, value: k }))}
          value={selected}
          onChange={setSelected}
          maxTagCount="responsive"
        />
      </div>
      {!hasData ? (
        <Text type="secondary">
          No spending data for the selected {label} in this period.
        </Text>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v) => fmt(v)}
              tick={{ fontSize: 11 }}
              width={72}
            />
            <Tooltip formatter={fmt} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {selected.map((item, i) => (
              <Line
                key={item}
                type="monotone"
                dataKey={`k${i}`}
                name={item}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

const TagBar = ({
  title,
  data,
  color,
  currency,
}: {
  title: string;
  data: { tag: string; total: number }[];
  color: string;
  currency: string;
}) => {
  const fmt = CurrencyTooltipFormatter(currency);
  return (
    <Card title={title}>
      {data.length === 0 ? (
        <Text type="secondary">No tagged transactions in this period</Text>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(160, data.length * 34)}
        >
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 32, left: 16, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f0f0f0"
              horizontal={false}
            />
            <XAxis
              type="number"
              tickFormatter={(v) => fmt(v)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="tag"
              tick={{ fontSize: 12 }}
              width={96}
            />
            <Tooltip formatter={fmt} />
            <Bar dataKey="total" fill={color} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

// === Main Component ===
export const ChartsTab = () => {
  const { currency } = useCurrency();

  const defaultEnd = dayjs();
  const defaultStart = defaultEnd.subtract(5, "month").startOf("month");

  const [startYear, setStartYear] = useState(defaultStart.year());
  const [startMonth, setStartMonth] = useState(defaultStart.month());
  const [endYear, setEndYear] = useState(defaultEnd.year());
  const [endMonth, setEndMonth] = useState(defaultEnd.month());

  const startDate = dayjs()
    .year(startYear)
    .month(startMonth)
    .startOf("month")
    .format("YYYY-MM-DD");
  const endDate = dayjs()
    .year(endYear)
    .month(endMonth)
    .startOf("month")
    .add(1, "month")
    .format("YYYY-MM-DD");

  const { trend, tags, categorySpendByMonth, tagSpendByMonth, loading } =
    useChartsData(startDate, endDate);

  const tagData = (type: TransactionType) =>
    tags.filter((t) => t.type === type).slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Date range picker */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Text strong>From:</Text>
        <Select
          value={startYear}
          onChange={setStartYear}
          options={yearOptions}
          style={{ width: 100 }}
        />
        <Select
          value={startMonth}
          onChange={setStartMonth}
          options={monthOptions}
          style={{ width: 90 }}
        />
        <Text strong>To:</Text>
        <Select
          value={endYear}
          onChange={setEndYear}
          options={yearOptions}
          style={{ width: 100 }}
        />
        <Select
          value={endMonth}
          onChange={setEndMonth}
          options={monthOptions}
          style={{ width: 90 }}
        />
      </div>

      {/* Trend chart */}
      {loading ? (
        <Card loading style={{ height: 300 }} />
      ) : (
        <TrendChart data={trend} currency={currency} />
      )}

      {/* Spending trendline (by category or tag) */}
      {loading ? (
        <Card loading style={{ height: 380 }} />
      ) : (
        <SpendingTrendlineChart
          categorySpendByMonth={categorySpendByMonth}
          tagSpendByMonth={tagSpendByMonth}
          startDate={startDate}
          endDate={endDate}
          currency={currency}
        />
      )}

      {/* Tag analytics */}
      <div>
        <Title level={5} style={{ marginBottom: 12 }}>
          By Tag
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            {loading ? (
              <Card loading style={{ height: 200 }} />
            ) : (
              <TagBar
                title="🏷️ Spending by tag"
                data={tagData(TRANSACTION_TYPES.SPEND)}
                color={TYPE_VALUE_COLORS[TRANSACTION_TYPES.SPEND]}
                currency={currency}
              />
            )}
          </Col>
          <Col xs={24} md={12}>
            {loading ? (
              <Card loading style={{ height: 200 }} />
            ) : (
              <TagBar
                title="🏷️ Earnings by tag"
                data={tagData(TRANSACTION_TYPES.EARN)}
                color={TYPE_VALUE_COLORS[TRANSACTION_TYPES.EARN]}
                currency={currency}
              />
            )}
          </Col>
        </Row>
      </div>
    </div>
  );
};

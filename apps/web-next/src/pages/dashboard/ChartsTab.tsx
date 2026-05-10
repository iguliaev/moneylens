import { useState } from "react";
import { Card, Col, Row, Select, Typography } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import dayjs from "dayjs";
import { useCurrency } from "../../contexts/currency";
import {
  TRANSACTION_TYPES,
  TYPE_VALUE_COLORS,
  TransactionType,
} from "../../constants/transactionTypes";
import { useChartsData } from "../../hooks";
import type { TrendPoint } from "../../hooks";
import { TrendChart } from "./components/TrendChart";
import { SpendingTrendlineChart } from "./components/SpendingTrendlineChart";

const { Text, Title } = Typography;

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

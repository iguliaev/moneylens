import { useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Segmented, Select, Typography, message } from "antd";
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
import { supabaseClient } from "../../utility";
import { useCurrency } from "../../contexts/currency";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TYPE_VALUE_COLORS,
  TransactionType,
} from "../../constants/transactionTypes";

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

// === Types ===
interface TrendPoint {
  month: string;
  earn: number;
  spend: number;
  save: number;
}

interface TagTotal {
  tag: string;
  type: TransactionType;
  total: number;
}

interface CategorySpendPoint {
  monthKey: string; // sort key "2025-01"
  category: string;
  total: number;
}

interface TagSpendPoint {
  monthKey: string;
  tag: string;
  total: number;
}

const isTransactionType = (v: string | null): v is TransactionType =>
  v !== null && Object.values(TRANSACTION_TYPES).includes(v as TransactionType);

const getMonthKeysInRange = (startDate: string, endDate: string): string[] => {
  const monthKeys: string[] = [];
  let cursor = dayjs(startDate).startOf("month");
  const rangeEnd = dayjs(endDate).startOf("month");

  while (cursor.isBefore(rangeEnd)) {
    monthKeys.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return monthKeys;
};

const formatMonthLabel = (month: string) => dayjs(month).format("MMM YY");

// === Data hook ===
const useChartsData = (startDate: string, endDate: string, refreshTrigger?: number) => {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [tags, setTags] = useState<TagTotal[]>([]);
  const [categorySpendByMonth, setCategorySpendByMonth] = useState<
    CategorySpendPoint[]
  >([]);
  const [tagSpendByMonth, setTagSpendByMonth] = useState<TagSpendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      try {
        const [trendRes, catRes, tagRes] = await Promise.all([
          supabaseClient
            .from("view_monthly_totals")
            .select("month, type, total")
            .gte("month", startDate)
            .lt("month", endDate)
            .order("month", { ascending: true }),
          supabaseClient
            .from("view_monthly_category_totals")
            .select("month, category, type, total")
            .gte("month", startDate)
            .lt("month", endDate),
          supabaseClient
            .from("view_monthly_tagged_type_totals")
            .select("month, tags, type, total")
            .gte("month", startDate)
            .lt("month", endDate),
        ]);

        if (trendRes.error) throw trendRes.error;
        if (catRes.error) throw catRes.error;
        if (tagRes.error) throw tagRes.error;

        if (cancelled) return;

        const trendMonthKeys = getMonthKeysInRange(startDate, endDate);
        const trendMap: Record<string, TrendPoint> = Object.fromEntries(
          trendMonthKeys.map((monthKey) => [
            monthKey,
            {
              month: formatMonthLabel(`${monthKey}-01`),
              earn: 0,
              spend: 0,
              save: 0,
            },
          ])
        );

        for (const row of trendRes.data ?? []) {
          if (!row.month || !isTransactionType(row.type)) continue;
          const monthKey = dayjs(row.month).format("YYYY-MM");
          if (!trendMap[monthKey]) continue;
          trendMap[monthKey][row.type] += Number(row.total) || 0;
        }
        setTrend(trendMonthKeys.map((monthKey) => trendMap[monthKey]));

        const catSpend: CategorySpendPoint[] = [];
        for (const row of catRes.data ?? []) {
          if (!isTransactionType(row.type)) continue;

          // Monthly spend breakdown for trendline
          if (row.type === TRANSACTION_TYPES.SPEND && row.month) {
            catSpend.push({
              monthKey: dayjs(row.month).format("YYYY-MM"),
              category: row.category ?? "Unknown",
              total: Number(row.total) || 0,
            });
          }
        }
        setCategorySpendByMonth(catSpend);

        // Explode tags array and aggregate per tag+type
        const tagMap: Record<string, TagTotal> = {};
        const tagSpend: TagSpendPoint[] = [];
        for (const row of tagRes.data ?? []) {
          if (!isTransactionType(row.type) || !row.tags?.length) continue;
          for (const tag of row.tags) {
            const key = `${row.type}__${tag}`;
            if (!tagMap[key]) tagMap[key] = { tag, type: row.type, total: 0 };
            tagMap[key].total += Number(row.total) || 0;

            // Monthly spend breakdown for trendline
            if (row.type === TRANSACTION_TYPES.SPEND && row.month) {
              tagSpend.push({
                monthKey: dayjs(row.month).format("YYYY-MM"),
                tag,
                total: Number(row.total) || 0,
              });
            }
          }
        }
        setTags(Object.values(tagMap).sort((a, b) => b.total - a.total));
        setTagSpendByMonth(tagSpend);
      } catch (err) {
        console.error("Error fetching chart data:", err);
        if (!cancelled) message.error("Failed to load chart data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, refreshTrigger]);

  return { trend, tags, categorySpendByMonth, tagSpendByMonth, loading };
};

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

const TrendChart = ({
  data,
  currency,
}: {
  data: TrendPoint[];
  currency: string;
}) => {
  const fmt = CurrencyTooltipFormatter(currency);
  return (
    <Card title="Income vs Spending vs Savings">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
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
          <Bar
            dataKey="earn"
            name={TRANSACTION_TYPE_LABELS[TRANSACTION_TYPES.EARN]}
            fill={TYPE_VALUE_COLORS[TRANSACTION_TYPES.EARN]}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="spend"
            name={TRANSACTION_TYPE_LABELS[TRANSACTION_TYPES.SPEND]}
            fill={TYPE_VALUE_COLORS[TRANSACTION_TYPES.SPEND]}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="save"
            name={TRANSACTION_TYPE_LABELS[TRANSACTION_TYPES.SAVE]}
            fill={TYPE_VALUE_COLORS[TRANSACTION_TYPES.SAVE]}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
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
export const ChartsTab = ({ refreshTrigger }: { refreshTrigger?: number }) => {
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
    useChartsData(startDate, endDate, refreshTrigger);

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

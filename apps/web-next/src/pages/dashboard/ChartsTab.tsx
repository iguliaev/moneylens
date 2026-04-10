import { useEffect, useState } from "react";
import { Card, Col, Row, Select, Typography, message } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
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
const DONUT_COLORS = [
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

interface CategoryTotal {
  category: string;
  type: TransactionType;
  total: number;
}

interface TagTotal {
  tag: string;
  type: TransactionType;
  total: number;
}

const isTransactionType = (v: string | null): v is TransactionType =>
  v !== null &&
  Object.values(TRANSACTION_TYPES).includes(v as TransactionType);

// === Data hook ===
const useChartsData = (startDate: string, endDate: string) => {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [tags, setTags] = useState<TagTotal[]>([]);
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

        // Build trend points keyed by month label
        const trendMap: Record<string, TrendPoint> = {};
        for (const row of trendRes.data ?? []) {
          if (!row.month || !isTransactionType(row.type)) continue;
          const label = dayjs(row.month).format("MMM YY");
          if (!trendMap[label]) trendMap[label] = { month: label, earn: 0, spend: 0, save: 0 };
          trendMap[label][row.type] += Number(row.total) || 0;
        }
        setTrend(Object.values(trendMap));

        // Aggregate categories across months
        const catMap: Record<string, CategoryTotal> = {};
        for (const row of catRes.data ?? []) {
          if (!isTransactionType(row.type)) continue;
          const key = `${row.type}__${row.category ?? "Unknown"}`;
          if (!catMap[key]) catMap[key] = { category: row.category ?? "Unknown", type: row.type, total: 0 };
          catMap[key].total += Number(row.total) || 0;
        }
        setCategories(Object.values(catMap));

        // Explode tags array and aggregate per tag+type
        const tagMap: Record<string, TagTotal> = {};
        for (const row of tagRes.data ?? []) {
          if (!isTransactionType(row.type) || !row.tags?.length) continue;
          for (const tag of row.tags) {
            const key = `${row.type}__${tag}`;
            if (!tagMap[key]) tagMap[key] = { tag, type: row.type, total: 0 };
            tagMap[key].total += Number(row.total) || 0;
          }
        }
        setTags(Object.values(tagMap).sort((a, b) => b.total - a.total));
      } catch (err) {
        console.error("Error fetching chart data:", err);
        if (!cancelled) message.error("Failed to load chart data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return { trend, categories, tags, loading };
};

// === Sub-components ===

const CurrencyTooltipFormatter =
  (currency: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (value: any): string => {
    const n = typeof value === "number" ? value : 0;
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
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
        <BarChart data={data} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={72} />
          <Tooltip formatter={fmt} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="earn"  name={TRANSACTION_TYPE_LABELS[TRANSACTION_TYPES.EARN]}  fill={TYPE_VALUE_COLORS[TRANSACTION_TYPES.EARN]}  radius={[3, 3, 0, 0]} />
          <Bar dataKey="spend" name={TRANSACTION_TYPE_LABELS[TRANSACTION_TYPES.SPEND]} fill={TYPE_VALUE_COLORS[TRANSACTION_TYPES.SPEND]} radius={[3, 3, 0, 0]} />
          <Bar dataKey="save"  name={TRANSACTION_TYPE_LABELS[TRANSACTION_TYPES.SAVE]}  fill={TYPE_VALUE_COLORS[TRANSACTION_TYPES.SAVE]}  radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};

const CategoryDonut = ({
  title,
  data,
  currency,
}: {
  title: string;
  data: { name: string; value: number }[];
  currency: string;
}) => {
  const fmt = CurrencyTooltipFormatter(currency);
  return (
    <Card title={title} style={{ height: "100%" }}>
      {data.length === 0 ? (
        <Text type="secondary">No data</Text>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="75%"
              dataKey="value"
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={fmt} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 12 }}
            />
          </PieChart>
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
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 32, left: 16, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="tag" tick={{ fontSize: 12 }} width={96} />
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

  const startDate = dayjs().year(startYear).month(startMonth).startOf("month").format("YYYY-MM-DD");
  const endDate = dayjs().year(endYear).month(endMonth).startOf("month").add(1, "month").format("YYYY-MM-DD");

  const { trend, categories, tags, loading } = useChartsData(startDate, endDate);

  const donutData = (type: TransactionType) =>
    categories
      .filter((c) => c.type === type)
      .sort((a, b) => b.total - a.total)
      .map((c) => ({ name: c.category, value: c.total }));

  const tagData = (type: TransactionType) =>
    tags.filter((t) => t.type === type).slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Date range picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Text strong>From:</Text>
        <Select value={startYear} onChange={setStartYear} options={yearOptions} style={{ width: 100 }} />
        <Select value={startMonth} onChange={setStartMonth} options={monthOptions} style={{ width: 90 }} />
        <Text strong>To:</Text>
        <Select value={endYear} onChange={setEndYear} options={yearOptions} style={{ width: 100 }} />
        <Select value={endMonth} onChange={setEndMonth} options={monthOptions} style={{ width: 90 }} />
      </div>

      {/* Trend chart */}
      {loading ? (
        <Card loading style={{ height: 300 }} />
      ) : (
        <TrendChart data={trend} currency={currency} />
      )}

      {/* Category donuts */}
      <div>
        <Title level={5} style={{ marginBottom: 12 }}>By Category</Title>
        <Row gutter={[16, 16]}>
          {Object.values(TRANSACTION_TYPES).map((type) => (
            <Col xs={24} md={8} key={type}>
              {loading ? (
                <Card loading style={{ height: 280 }} />
              ) : (
                <CategoryDonut
                  title={TRANSACTION_TYPE_LABELS[type]}
                  data={donutData(type)}
                  currency={currency}
                />
              )}
            </Col>
          ))}
        </Row>
      </div>

      {/* Tag analytics */}
      <div>
        <Title level={5} style={{ marginBottom: 12 }}>By Tag</Title>
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

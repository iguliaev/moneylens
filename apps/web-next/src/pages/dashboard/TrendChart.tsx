import React from "react";
import { theme, Empty } from "antd";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_HEX,
  TRANSACTION_TYPE_LABELS,
} from "../../constants/transactionTypes";

interface MonthDataRow {
  month: string | null;
  type: string | null;
  total: number | string | null;
}

interface ChartDataPoint {
  month: string;
  earn: number;
  spend: number;
  save: number;
}

interface TrendChartProps {
  data: MonthDataRow[];
  loading?: boolean;
}

/** Aggregates flat month-type rows into the shape recharts needs. */
function buildChartData(rows: MonthDataRow[]): ChartDataPoint[] {
  const map = new Map<string, ChartDataPoint>();

  for (const row of rows) {
    if (!row.month) continue;
    const label = dayjs(row.month).format("MMM");
    if (!map.has(label)) {
      map.set(label, { month: label, earn: 0, spend: 0, save: 0 });
    }
    const point = map.get(label)!;
    if (row.type === "earn" || row.type === "spend" || row.type === "save") {
      point[row.type] = Number(row.total) || 0;
    }
  }

  // Sort by calendar month order
  return [...map.values()].sort(
    (a, b) =>
      dayjs(`2000-${a.month}-01`, "YYYY-MMM-DD").month() -
      dayjs(`2000-${b.month}-01`, "YYYY-MMM-DD").month()
  );
}

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  loading = false,
}) => {
  const { token } = theme.useToken();
  const chartData = buildChartData(data);

  if (!loading && chartData.length === 0) {
    return <Empty description="No monthly data for this year" />;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
        barCategoryGap="30%"
        barGap={2}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={token.colorBorderSecondary}
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => currencyFormatter.format(v)}
          tick={{ fill: token.colorTextSecondary, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip
          formatter={(value) =>
            typeof value === "number" ? currencyFormatter.format(value) : String(value)
          }
          contentStyle={{
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadius,
            color: token.colorText,
            fontSize: 13,
          }}
          cursor={{ fill: token.colorFillQuaternary }}
        />
        <Legend
          wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
          formatter={(value) =>
            TRANSACTION_TYPE_LABELS[
              value as keyof typeof TRANSACTION_TYPE_LABELS
            ] ?? value
          }
        />
        <Bar
          dataKey="earn"
          fill={TRANSACTION_TYPE_HEX.earn}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="spend"
          fill={TRANSACTION_TYPE_HEX.spend}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="save"
          fill={TRANSACTION_TYPE_HEX.save}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

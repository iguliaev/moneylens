import { useEffect, useMemo, useState } from "react";
import { Card, Segmented, Select, Typography } from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getMonthKeysInRange, formatMonthLabel } from "../../../utility/monthHelpers";
import { makeCurrencyFormatter } from "../../../utility/currency";
import type { CategorySpendPoint, TagSpendPoint } from "../../../hooks";

const { Text } = Typography;

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

export const SpendingTrendlineChart = ({
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
  const [mode, setMode] = useState<"category" | "tag">("category");
  const [selected, setSelected] = useState<string[]>([]);
  const fmt = makeCurrencyFormatter(currency);

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

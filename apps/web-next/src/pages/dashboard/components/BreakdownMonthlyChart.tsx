import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { makeCurrencyFormatter } from "../../../utility/currency";
import { formatMonthLabel } from "../../../utility/monthHelpers";
import { CHART_GRID_COLOR } from "../../../theme/tokens";
import type { BreakdownMonthPoint } from "../../../utility/breakdown";

export const BreakdownMonthlyChart = ({
  series,
  color,
  currency,
}: {
  series: BreakdownMonthPoint[];
  color: string;
  currency: string;
}) => {
  const fmt = makeCurrencyFormatter(currency);
  const data = series.map((p) => ({
    month: formatMonthLabel(p.monthKey),
    total: p.total,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => fmt(v)}
          tick={{ fontSize: 11 }}
          width={72}
        />
        <Tooltip formatter={fmt} />
        <Bar dataKey="total" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

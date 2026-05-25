import { Card } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TYPE_VALUE_COLORS,
} from "../../../constants/transactionTypes";
import { makeCurrencyFormatter } from "../../../utility/currency";
import type { TrendPoint } from "../../../hooks";

export const TrendChart = ({
  data,
  currency,
}: {
  data: TrendPoint[];
  currency: string;
}) => {
  const fmt = makeCurrencyFormatter(currency);
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

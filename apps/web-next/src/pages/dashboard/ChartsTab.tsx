import { useState } from "react";
import { Alert, Card, Col, Row, Typography } from "antd";
import dayjs from "dayjs";
import { useCurrency } from "../../contexts/currency";
import {
  TRANSACTION_TYPES,
  TYPE_VALUE_COLORS,
  type TransactionType,
} from "../../constants/transactionTypes";
import { useChartsData } from "../../hooks";
import { MonthRangePicker } from "../../components/MonthRangePicker";
import { TrendChart } from "./components/TrendChart";
import { SpendingTrendlineChart } from "./components/SpendingTrendlineChart";
import { TagBar } from "./components/TagBar";

const { Title } = Typography;
export const ChartsTab = () => {
  const { currency } = useCurrency();

  const defaultEnd = dayjs();
  const defaultStart = defaultEnd.subtract(5, "month").startOf("month");

  const [startYear, setStartYear] = useState(defaultStart.year());
  const [startMonth, setStartMonth] = useState(defaultStart.month());
  const [endYear, setEndYear] = useState(defaultEnd.year());
  const [endMonth, setEndMonth] = useState(defaultEnd.month());
  const startMonthValue = dayjs().year(startYear).month(startMonth).startOf("month");
  const endMonthValue = dayjs().year(endYear).month(endMonth).startOf("month");
  const hasInvalidRange = !endMonthValue.isAfter(startMonthValue);

  const startDate = startMonthValue.format("YYYY-MM-DD");
  const endDate = endMonthValue.add(1, "month").format("YYYY-MM-DD");

  const { trend, tags, categorySpendByMonth, tagSpendByMonth, loading, error } =
    useChartsData(startDate, endDate);

  const tagData = (type: TransactionType) =>
    tags.filter((t) => t.type === type).slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Date range picker */}
      <MonthRangePicker
        startYear={startYear}
        startMonth={startMonth}
        endYear={endYear}
        endMonth={endMonth}
        onChange={(next) => {
          setStartYear(next.startYear);
          setStartMonth(next.startMonth);
          setEndYear(next.endYear);
          setEndMonth(next.endMonth);
        }}
      />
      {hasInvalidRange && (
        <Alert
          type="warning"
          showIcon
          message="End month must be after start month"
        />
      )}
      {!hasInvalidRange && error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load chart data"
          description={error.message}
        />
      )}

      {!hasInvalidRange && (
        <>
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
        </>
      )}
    </div>
  );
};

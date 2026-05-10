import { Alert, Select, Typography } from "antd";
import { type FC } from "react";
import dayjs from "dayjs";
import { yearOptions, monthOptions } from "../../../constants/dateOptions";
import { usePeriodStats } from "../../../hooks";
import { TypeSummaryCards } from "./TypeSummaryCards";
import { CategoryBreakdownSection } from "./CategoryBreakdownSection";

const { Text } = Typography;

type PeriodTabProps = {
  period: "year" | "month";
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedMonth?: number;
  setSelectedMonth?: (month: number) => void;
};

export const PeriodTab: FC<PeriodTabProps> = ({
  period,
  selectedYear,
  setSelectedYear,
  selectedMonth = 0,
  setSelectedMonth,
}) => {
  const dateRange =
    period === "year"
      ? {
          start: dayjs()
            .year(selectedYear)
            .startOf("year")
            .format("YYYY-MM-DD"),
          end: dayjs()
            .year(selectedYear)
            .startOf("year")
            .add(1, "year")
            .format("YYYY-MM-DD"),
        }
      : {
          start: dayjs()
            .year(selectedYear)
            .month(selectedMonth)
            .startOf("month")
            .format("YYYY-MM-DD"),
          end: dayjs()
            .year(selectedYear)
            .month(selectedMonth)
            .startOf("month")
            .add(1, "month")
            .format("YYYY-MM-DD"),
        };

  const stats = usePeriodStats({
    period,
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Text strong>Year:</Text>
        <Select
          value={selectedYear}
          onChange={setSelectedYear}
          options={yearOptions}
          style={{ width: 120 }}
        />
        {period === "month" && setSelectedMonth && (
          <>
            <Text strong>Month:</Text>
            <Select
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={monthOptions}
              style={{ width: 150 }}
            />
          </>
        )}
      </div>
      <TypeSummaryCards
        data={stats.typeSummary}
        previousData={stats.previousTypeSummary}
        loading={stats.loading}
      />
      {stats.error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load summary data"
          description={stats.error}
        />
      )}
      <CategoryBreakdownSection
        data={stats.categorySummary}
        loading={stats.loading}
      />
    </div>
  );
};

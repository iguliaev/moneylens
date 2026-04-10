import {
  Card,
  Col,
  Row,
  type TableColumnsType,
  Typography,
  Select,
  Statistic,
  Table,
  Tabs,
  message,
} from "antd";
import { Show } from "@refinedev/antd";
import { BudgetsSection } from "./BudgetsSection";

import { useEffect, useState, type FC } from "react";
import { useCurrency } from "../../contexts/currency";
import dayjs from "dayjs";
import { supabaseClient } from "../../utility";
import type { Tables } from "../../types/database.types";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TransactionType,
  TYPE_VALUE_COLORS,
} from "../../constants/transactionTypes";

const { Text, Title } = Typography;

// === Types ===
interface CategorySummary {
  category_name: string;
  type: TransactionType;
  total: number;
}

interface TypeSummary {
  type: TransactionType;
  total: number;
}

interface PeriodStats {
  typeSummary: TypeSummary[];
  categorySummary: CategorySummary[];
}

type Period = "month" | "year";

type MonthlyTotalsRow = Pick<
  Tables<"view_monthly_totals">,
  "month" | "total" | "type"
>;
type YearlyTotalsRow = Pick<
  Tables<"view_yearly_totals">,
  "year" | "total" | "type"
>;
type MonthlyCategoryTotalsRow = Pick<
  Tables<"view_monthly_category_totals">,
  "category" | "month" | "total" | "type"
>;
type YearlyCategoryTotalsRow = Pick<
  Tables<"view_yearly_category_totals">,
  "category" | "year" | "total" | "type"
>;

// === Constants ===
const currentYear = dayjs().year();

const yearOptions = Array.from({ length: 6 }, (_, i) => ({
  label: String(currentYear - i),
  value: currentYear - i,
}));

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  label: dayjs().month(i).format("MMMM"),
  value: i,
}));

const TYPE_COLORS = TYPE_VALUE_COLORS;

// === Utilities ===
const formatCurrencyLocal = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount);

const isTransactionType = (value: string | null): value is TransactionType =>
  value !== null &&
  Object.values(TRANSACTION_TYPES).includes(value as TransactionType);

const mapTypeSummary = (
  rows: (MonthlyTotalsRow | YearlyTotalsRow)[]
): TypeSummary[] =>
  rows.flatMap((row) =>
    isTransactionType(row.type)
      ? [
          {
            type: row.type,
            total: Number(row.total) || 0,
          },
        ]
      : []
  );

const mapCategorySummary = (
  rows: (MonthlyCategoryTotalsRow | YearlyCategoryTotalsRow)[]
): CategorySummary[] =>
  rows.flatMap((row) =>
    isTransactionType(row.type)
      ? [
          {
            category_name: row.category || "Unknown",
            type: row.type,
            total: Number(row.total) || 0,
          },
        ]
      : []
  );

const fetchYearStats = async (
  startDate: string,
  endDate: string
): Promise<PeriodStats> => {
  const [typeResponse, categoryResponse] = await Promise.all([
    supabaseClient
      .from("view_yearly_totals")
      .select("type, total, year")
      .gte("year", startDate)
      .lt("year", endDate),
    supabaseClient
      .from("view_yearly_category_totals")
      .select("category, type, total, year")
      .gte("year", startDate)
      .lt("year", endDate),
  ]);

  if (typeResponse.error) throw typeResponse.error;
  if (categoryResponse.error) throw categoryResponse.error;

  return {
    typeSummary: mapTypeSummary(typeResponse.data || []),
    categorySummary: mapCategorySummary(categoryResponse.data || []),
  };
};

const fetchMonthStats = async (
  startDate: string,
  endDate: string
): Promise<PeriodStats> => {
  const [typeResponse, categoryResponse] = await Promise.all([
    supabaseClient
      .from("view_monthly_totals")
      .select("type, total, month")
      .gte("month", startDate)
      .lt("month", endDate),
    supabaseClient
      .from("view_monthly_category_totals")
      .select("category, type, total, month")
      .gte("month", startDate)
      .lt("month", endDate),
  ]);

  if (typeResponse.error) throw typeResponse.error;
  if (categoryResponse.error) throw categoryResponse.error;

  return {
    typeSummary: mapTypeSummary(typeResponse.data || []),
    categorySummary: mapCategorySummary(categoryResponse.data || []),
  };
};

// === Data Fetching Hook ===
const fetchPrevTypeSummary = async (
  period: Period,
  prevStart: string,
  prevEnd: string
): Promise<TypeSummary[]> => {
  if (period === "year") {
    const { data, error } = await supabaseClient
      .from("view_yearly_totals")
      .select("type, total, year")
      .gte("year", prevStart)
      .lt("year", prevEnd);
    if (error) throw error;
    return mapTypeSummary(data || []);
  }
  const { data, error } = await supabaseClient
    .from("view_monthly_totals")
    .select("type, total, month")
    .gte("month", prevStart)
    .lt("month", prevEnd);
  if (error) throw error;
  return mapTypeSummary(data || []);
};

const usePeriodStats = ({
  period,
  startDate,
  endDate,
}: {
  period: Period;
  startDate: string;
  endDate: string;
}) => {
  const [stats, setStats] = useState<PeriodStats>({
    typeSummary: [],
    categorySummary: [],
  });
  const [previousTypeSummary, setPreviousTypeSummary] = useState<TypeSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const prevStart = dayjs(startDate)
      .subtract(1, period === "year" ? "year" : "month")
      .format("YYYY-MM-DD");
    const prevEnd = dayjs(endDate)
      .subtract(1, period === "year" ? "year" : "month")
      .format("YYYY-MM-DD");

    const fetchData = async () => {
      setLoading(true);

      try {
        const [nextStats, prevSummary] = await Promise.all([
          period === "year"
            ? fetchYearStats(startDate, endDate)
            : fetchMonthStats(startDate, endDate),
          fetchPrevTypeSummary(period, prevStart, prevEnd).catch((err) => {
            console.error("Error fetching previous period summary:", err);
            return null as TypeSummary[] | null;
          }),
        ]);

        if (!cancelled) {
          setStats(nextStats);
          setPreviousTypeSummary(prevSummary);
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
        if (!cancelled) {
          message.error("Failed to load statistics");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [endDate, period, startDate]);

  return { ...stats, previousTypeSummary, loading };
};

// === Components ===
const TrendBadge = ({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) => {
  const baseStyle = {
    fontSize: 12,
    display: "block",
    marginTop: 4,
  } as const;

  if (previous === 0 && current === 0) {
    return (
      <Text style={{ ...baseStyle, color: "#8c8c8c" }}>
        — 0.0% vs prev period
      </Text>
    );
  }

  if (previous === 0) {
    const isPositive = current > 0;
    return (
      <Text style={{ ...baseStyle, color: isPositive ? "#52c41a" : "#ff4d4f" }}>
        {isPositive ? "↑" : "↓"} New vs prev period
      </Text>
    );
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100;

  if (pct === 0) {
    return (
      <Text style={{ ...baseStyle, color: "#8c8c8c" }}>
        → 0.0% vs prev period
      </Text>
    );
  }

  const isUp = pct > 0;
  return (
    <Text style={{ ...baseStyle, color: isUp ? "#52c41a" : "#ff4d4f" }}>
      {isUp ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}% vs prev period
    </Text>
  );
};

const TypeSummaryCards = ({
  data,
  previousData,
  loading,
}: {
  data: TypeSummary[];
  previousData: TypeSummary[] | null;
  loading: boolean;
}) => {
  const { currency } = useCurrency();
  const getAmount = (type: TransactionType, source: TypeSummary[] = data) =>
    source.find((d) => d.type === type)?.total ?? 0;

  const earnings = getAmount(TRANSACTION_TYPES.EARN);
  const spending = getAmount(TRANSACTION_TYPES.SPEND);
  const netIncome = earnings - spending;
  const prevEarnings = getAmount(TRANSACTION_TYPES.EARN, previousData ?? []);
  const prevSpending = getAmount(TRANSACTION_TYPES.SPEND, previousData ?? []);
  const prevNetIncome = prevEarnings - prevSpending;

  return (
    <Row gutter={[16, 16]}>
      {Object.values(TRANSACTION_TYPES).map((type) => {
        const current = getAmount(type);
        const previous = getAmount(type, previousData ?? []);
        return (
          <Col xs={24} sm={12} lg={6} key={type}>
            <Card>
              <Statistic
                title={TRANSACTION_TYPE_LABELS[type]}
                value={current}
                precision={2}
                formatter={(value) =>
                  formatCurrencyLocal(typeof value === "number" ? value : 0, currency)
                }
                loading={loading}
                valueStyle={{ color: TYPE_COLORS[type] }}
              />
              {!loading && previousData !== null && (
                <TrendBadge current={current} previous={previous} />
              )}
            </Card>
          </Col>
        );
      })}
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Net Income"
            value={netIncome}
            precision={2}
            formatter={(value) =>
              formatCurrencyLocal(typeof value === "number" ? value : 0, currency)
            }
            loading={loading}
            valueStyle={{ color: netIncome > 0 ? "#52c41a" : netIncome < 0 ? "#ff4d4f" : undefined }}
          />
          {!loading && previousData !== null && (
            <TrendBadge current={netIncome} previous={prevNetIncome} />
          )}
        </Card>
      </Col>
    </Row>
  );
};

const CategoryBreakdownTable = ({
  data,
  loading,
  type,
}: {
  data: CategorySummary[];
  loading: boolean;
  type: TransactionType;
}) => {
  const { currency } = useCurrency();
  const filteredData = data.filter((d) => d.type === type);

  const columns: TableColumnsType<CategorySummary> = [
    {
      title: "Category",
      dataIndex: "category_name",
      key: "category_name",
      sorter: (a: CategorySummary, b: CategorySummary) =>
        a.category_name.localeCompare(b.category_name),
      sortDirections: ["ascend", "descend"],
    },
    {
      title: "Amount",
      dataIndex: "total",
      key: "total",
      sorter: (a: CategorySummary, b: CategorySummary) => a.total - b.total,
      defaultSortOrder: "descend",
      sortDirections: ["descend", "ascend"],
      render: (value: number) => formatCurrencyLocal(value, currency),
      align: "right" as const,
    },
  ];

  return (
    <Table
      dataSource={filteredData}
      columns={columns}
      rowKey={(row) => `${row.type}-${row.category_name}`}
      loading={loading}
      pagination={{
        pageSize: 10,
        hideOnSinglePage: true,
        showSizeChanger: false,
      }}
      size="small"
      summary={() => {
        const total = filteredData.reduce((sum, row) => sum + row.total, 0);
        return (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>Total</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>{formatCurrencyLocal(total, currency)}</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        );
      }}
    />
  );
};

const CategoryBreakdownSection = ({
  data,
  loading,
}: {
  data: CategorySummary[];
  loading: boolean;
}) => (
  <>
    <Title level={4}>By Category</Title>
    <Row gutter={[16, 16]}>
      {Object.values(TRANSACTION_TYPES).map((type) => (
        <Col xs={24} md={8} key={type}>
          <Card title={TRANSACTION_TYPE_LABELS[type]} size="small">
            <CategoryBreakdownTable data={data} loading={loading} type={type} />
          </Card>
        </Col>
      ))}
    </Row>
  </>
);

// === Main Component ===
export const DashboardPage: FC = () => {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());

  // Compute date ranges
  const yearDateRange = {
    start: dayjs().year(selectedYear).startOf("year").format("YYYY-MM-DD"),
    end: dayjs()
      .year(selectedYear)
      .startOf("year")
      .add(1, "year")
      .format("YYYY-MM-DD"),
  };

  const monthDateRange = {
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

  // Fetch data using custom hook
  const yearStats = usePeriodStats({
    period: "year",
    startDate: yearDateRange.start,
    endDate: yearDateRange.end,
  });
  const monthStats = usePeriodStats({
    period: "month",
    startDate: monthDateRange.start,
    endDate: monthDateRange.end,
  });

  const tabItems = [
    {
      key: "yearly",
      label: "Yearly Statistics",
      children: (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Text strong>Year:</Text>
            <Select
              value={selectedYear}
              onChange={setSelectedYear}
              options={yearOptions}
              style={{ width: 120 }}
            />
          </div>
          <TypeSummaryCards
            data={yearStats.typeSummary}
            previousData={yearStats.previousTypeSummary}
            loading={yearStats.loading}
          />
          <CategoryBreakdownSection
            data={yearStats.categorySummary}
            loading={yearStats.loading}
          />
        </div>
      ),
    },
    {
      key: "monthly",
      label: "Monthly Statistics",
      children: (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Text strong>Year:</Text>
            <Select
              value={selectedYear}
              onChange={setSelectedYear}
              options={yearOptions}
              style={{ width: 120 }}
            />
            <Text strong>Month:</Text>
            <Select
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={monthOptions}
              style={{ width: 150 }}
            />
          </div>
          <TypeSummaryCards
            data={monthStats.typeSummary}
            previousData={monthStats.previousTypeSummary}
            loading={monthStats.loading}
          />
          <CategoryBreakdownSection
            data={monthStats.categorySummary}
            loading={monthStats.loading}
          />
        </div>
      ),
    },
  ];

  return (
    <Show title="Dashboard" headerButtons={() => null}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Tabs items={tabItems} defaultActiveKey="yearly" />
        <BudgetsSection />
      </div>
    </Show>
  );
};

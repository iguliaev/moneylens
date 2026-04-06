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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      try {
        const nextStats =
          period === "year"
            ? await fetchYearStats(startDate, endDate)
            : await fetchMonthStats(startDate, endDate);

        if (!cancelled) {
          setStats(nextStats);
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

  return { ...stats, loading };
};

// === Components ===
const TypeSummaryCards = ({
  data,
  loading,
}: {
  data: TypeSummary[];
  loading: boolean;
}) => {
  const { currency } = useCurrency();
  const getAmount = (type: TransactionType) =>
    data.find((d) => d.type === type)?.total ?? 0;

  return (
    <Row gutter={[16, 16]}>
      {Object.values(TRANSACTION_TYPES).map((type) => (
        <Col xs={24} sm={8} key={type}>
          <Card>
            <Statistic
              title={TRANSACTION_TYPE_LABELS[type]}
              value={getAmount(type)}
              precision={2}
              formatter={(value) =>
                formatCurrencyLocal(typeof value === "number" ? value : 0, currency)
              }
              loading={loading}
              valueStyle={{ color: TYPE_COLORS[type] }}
            />
          </Card>
        </Col>
      ))}
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

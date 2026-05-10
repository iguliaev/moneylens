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
} from "antd";
import { Show } from "@refinedev/antd";
import { BudgetsSection } from "./BudgetsSection";
import { ChartsTab } from "./ChartsTab";
import { TrendBadge } from "./components/TrendBadge";

import { useState, type FC } from "react";
import { useCurrency } from "../../contexts/currency";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TransactionType,
  TYPE_VALUE_COLORS,
} from "../../constants/transactionTypes";
import {
  usePeriodStats,
  type CategorySummary,
  type TypeSummary,
} from "../../hooks";

const { Text, Title } = Typography;

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

// === Components ===
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
                  formatCurrencyLocal(
                    typeof value === "number" ? value : 0,
                    currency
                  )
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
              formatCurrencyLocal(
                typeof value === "number" ? value : 0,
                currency
              )
            }
            loading={loading}
            valueStyle={{
              color:
                netIncome > 0
                  ? "#52c41a"
                  : netIncome < 0
                    ? "#ff4d4f"
                    : undefined,
            }}
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
    {
      key: "charts",
      label: "📊 Charts",
      children: <ChartsTab />,
    },
  ];

  return (
    <Show title="Dashboard" headerButtons={() => null}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Tabs items={tabItems} defaultActiveKey="monthly" />
        <BudgetsSection />
      </div>
    </Show>
  );
};

import {
  Card,
  Col,
  Row,
  Typography,
  Select,
  Statistic,
  Table,
  Tabs,
  message,
} from "antd";
import { Show } from "@refinedev/antd";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { supabaseClient } from "../../utility";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TransactionType,
} from "../../constants/transactionTypes";

const { Text, Title } = Typography;

// === Types ===
interface CategorySummary {
  category_id: string;
  category_name: string;
  type: TransactionType;
  total: number;
}

interface TypeSummary {
  type: TransactionType;
  total: number;
}

interface TransactionRow {
  type: TransactionType;
  category_id: string;
  categories: { name: string } | { name: string }[] | null;
  amount: number;
}

interface PeriodStats {
  typeSummary: TypeSummary[];
  categorySummary: CategorySummary[];
}

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

const TYPE_COLORS: Record<TransactionType, string> = {
  earn: "#3f8600",
  spend: "#cf1322",
  save: "#1890ff",
};

// === Utilities ===
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);

const aggregateByCategory = (data: TransactionRow[]): CategorySummary[] => {
  const categoryMap = new Map<string, CategorySummary>();

  data.forEach((t) => {
    const key = t.category_id;
    if (!key) return;

    // Handle both single object and array (Supabase join result)
    const categoryName = Array.isArray(t.categories)
      ? t.categories[0]?.name
      : t.categories?.name;

    const existing = categoryMap.get(key);
    if (existing) {
      existing.total += Number(t.amount);
    } else {
      categoryMap.set(key, {
        category_id: t.category_id,
        category_name: categoryName || "Unknown",
        type: t.type,
        total: Number(t.amount),
      });
    }
  });

  return Array.from(categoryMap.values());
};

// === Data Fetching Hook ===
const usePeriodStats = (startDate: string, endDate: string) => {
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
        // Fetch totals by type in parallel
        const typePromises = Object.values(TRANSACTION_TYPES).map(
          async (type) => {
            const { data, error } = await supabaseClient.rpc(
              "sum_transactions_amount",
              {
                p_from: startDate,
                p_to: endDate,
                p_type: type,
              }
            );
            if (error) throw error;
            return { type, total: Number(data) || 0 };
          }
        );

        // Fetch category breakdown
        const { data: categoryData, error: categoryError } =
          await supabaseClient
            .from("transactions")
            .select("type, category_id, categories(name), amount")
            .gte("date", startDate)
            .lte("date", endDate);

        if (categoryError) throw categoryError;

        const [typeSummary] = await Promise.all([Promise.all(typePromises)]);

        if (!cancelled) {
          setStats({
            typeSummary,
            categorySummary: aggregateByCategory(
              (categoryData as TransactionRow[]) || []
            ),
          });
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
  }, [startDate, endDate]);

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
              prefix="$"
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
  const filteredData = data
    .filter((d) => d.type === type)
    .sort((a, b) => b.total - a.total);

  const columns = [
    {
      title: "Category",
      dataIndex: "category_name",
      key: "category_name",
    },
    {
      title: "Amount",
      dataIndex: "total",
      key: "total",
      render: (value: number) => formatCurrency(value),
      align: "right" as const,
    },
  ];

  return (
    <Table
      dataSource={filteredData}
      columns={columns}
      rowKey="category_id"
      loading={loading}
      pagination={false}
      size="small"
      summary={(pageData) => {
        const total = pageData.reduce((sum, row) => sum + row.total, 0);
        return (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>Total</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>{formatCurrency(total)}</Text>
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
export const DashboardPage: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());

  // Compute date ranges
  const yearDateRange = {
    start: dayjs().year(selectedYear).startOf("year").format("YYYY-MM-DD"),
    end: dayjs().year(selectedYear).endOf("year").format("YYYY-MM-DD"),
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
      .endOf("month")
      .format("YYYY-MM-DD"),
  };

  // Fetch data using custom hook
  const yearStats = usePeriodStats(yearDateRange.start, yearDateRange.end);
  const monthStats = usePeriodStats(monthDateRange.start, monthDateRange.end);

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
      <Tabs items={tabItems} defaultActiveKey="yearly" />
    </Show>
  );
};

import {
  Card,
  Col,
  Row,
  Typography,
  Select,
  Statistic,
  Table,
  Tabs,
  Spin,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabaseClient } from "../utility";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TransactionType,
} from "../constants/transactionTypes";

const { Text, Title } = Typography;

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

// Generate year options (last 5 years + current)
const currentYear = dayjs().year();
const yearOptions = Array.from({ length: 6 }, (_, i) => ({
  label: String(currentYear - i),
  value: currentYear - i,
}));

// Generate month options
const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  label: dayjs().month(i).format("MMMM"),
  value: i,
}));

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);

// Summary cards for Earn/Spend/Save
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
              valueStyle={{
                color:
                  type === "earn"
                    ? "#3f8600"
                    : type === "spend"
                    ? "#cf1322"
                    : "#1890ff",
              }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

// Category breakdown table
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

export const DashboardPage: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());

  // Year data
  const [yearTypeSummary, setYearTypeSummary] = useState<TypeSummary[]>([]);
  const [yearCategorySummary, setYearCategorySummary] = useState<
    CategorySummary[]
  >([]);
  const [yearLoading, setYearLoading] = useState(true);

  // Month data
  const [monthTypeSummary, setMonthTypeSummary] = useState<TypeSummary[]>([]);
  const [monthCategorySummary, setMonthCategorySummary] = useState<
    CategorySummary[]
  >([]);
  const [monthLoading, setMonthLoading] = useState(true);

  // Fetch year statistics
  useEffect(() => {
    const fetchYearData = async () => {
      setYearLoading(true);
      const startDate = dayjs()
        .year(selectedYear)
        .startOf("year")
        .format("YYYY-MM-DD");
      const endDate = dayjs()
        .year(selectedYear)
        .endOf("year")
        .format("YYYY-MM-DD");

      try {
        // Fetch totals by type
        const typePromises = Object.values(TRANSACTION_TYPES).map(
          async (type) => {
            const { data } = await supabaseClient.rpc(
              "sum_transactions_amount",
              {
                p_from: startDate,
                p_to: endDate,
                p_type: type,
              }
            );
            return { type, total: Number(data) || 0 };
          }
        );

        // Fetch category breakdown
        const { data: categoryData } = await supabaseClient
          .from("transactions")
          .select("type, category_id, categories(name), amount")
          .gte("date", startDate)
          .lte("date", endDate);

        const typeSummary = await Promise.all(typePromises);
        setYearTypeSummary(typeSummary);

        // Aggregate by category
        const categoryMap = new Map<string, CategorySummary>();
        categoryData?.forEach((t: any) => {
          const key = t.category_id;
          if (!key) return;
          const existing = categoryMap.get(key);
          if (existing) {
            existing.total += Number(t.amount);
          } else {
            categoryMap.set(key, {
              category_id: t.category_id,
              category_name: t.categories?.name || "Unknown",
              type: t.type,
              total: Number(t.amount),
            });
          }
        });
        setYearCategorySummary(Array.from(categoryMap.values()));
      } catch (error) {
        console.error("Error fetching year data:", error);
      } finally {
        setYearLoading(false);
      }
    };

    fetchYearData();
  }, [selectedYear]);

  // Fetch month statistics
  useEffect(() => {
    const fetchMonthData = async () => {
      setMonthLoading(true);
      const startDate = dayjs()
        .year(selectedYear)
        .month(selectedMonth)
        .startOf("month")
        .format("YYYY-MM-DD");
      const endDate = dayjs()
        .year(selectedYear)
        .month(selectedMonth)
        .endOf("month")
        .format("YYYY-MM-DD");

      try {
        // Fetch totals by type
        const typePromises = Object.values(TRANSACTION_TYPES).map(
          async (type) => {
            const { data } = await supabaseClient.rpc(
              "sum_transactions_amount",
              {
                p_from: startDate,
                p_to: endDate,
                p_type: type,
              }
            );
            return { type, total: Number(data) || 0 };
          }
        );

        // Fetch category breakdown
        const { data: categoryData } = await supabaseClient
          .from("transactions")
          .select("type, category_id, categories(name), amount")
          .gte("date", startDate)
          .lte("date", endDate);

        const typeSummary = await Promise.all(typePromises);
        setMonthTypeSummary(typeSummary);

        // Aggregate by category
        const categoryMap = new Map<string, CategorySummary>();
        categoryData?.forEach((t: any) => {
          const key = t.category_id;
          if (!key) return;
          const existing = categoryMap.get(key);
          if (existing) {
            existing.total += Number(t.amount);
          } else {
            categoryMap.set(key, {
              category_id: t.category_id,
              category_name: t.categories?.name || "Unknown",
              type: t.type,
              total: Number(t.amount),
            });
          }
        });
        setMonthCategorySummary(Array.from(categoryMap.values()));
      } catch (error) {
        console.error("Error fetching month data:", error);
      } finally {
        setMonthLoading(false);
      }
    };

    fetchMonthData();
  }, [selectedYear, selectedMonth]);

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

          <TypeSummaryCards data={yearTypeSummary} loading={yearLoading} />

          <Title level={4}>By Category</Title>
          <Row gutter={[16, 16]}>
            {Object.values(TRANSACTION_TYPES).map((type) => (
              <Col xs={24} md={8} key={type}>
                <Card title={TRANSACTION_TYPE_LABELS[type]} size="small">
                  <CategoryBreakdownTable
                    data={yearCategorySummary}
                    loading={yearLoading}
                    type={type}
                  />
                </Card>
              </Col>
            ))}
          </Row>
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

          <TypeSummaryCards data={monthTypeSummary} loading={monthLoading} />

          <Title level={4}>By Category</Title>
          <Row gutter={[16, 16]}>
            {Object.values(TRANSACTION_TYPES).map((type) => (
              <Col xs={24} md={8} key={type}>
                <Card title={TRANSACTION_TYPE_LABELS[type]} size="small">
                  <CategoryBreakdownTable
                    data={monthCategorySummary}
                    loading={monthLoading}
                    type={type}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Dashboard</Title>
      <Tabs items={tabItems} defaultActiveKey="yearly" />
    </div>
  );
};

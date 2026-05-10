# Dashboard Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the dashboard monolith into focused single-responsibility files, deduplicate shared constants, and replace a manual tag `useList` pattern with Refine's `useSelect`.

**Architecture:** Pure refactor — zero logic changes. Extract inline components and constants out of `dashboard/index.tsx` (383 lines) and `ChartsTab.tsx` (436 lines) into dedicated files under `src/pages/dashboard/components/`. Move shared date constants to `src/constants/dateOptions.ts`. Replace `formatCurrencyLocal` with the canonical `formatCurrency` from `src/utility/currency.ts`. Swap `useList + useMemo` for tags with `useSelect`.

**Tech Stack:** React 19, Ant Design 5, Refine `@refinedev/antd`, TypeScript, Playwright E2E

---

## Note: H1 Already Complete

Before starting, be aware that spec item H1 ("Replace direct Supabase calls with Refine `useList`") is **already implemented**:
- `src/hooks/usePeriodStats.ts` — uses Refine `useList`
- `src/hooks/useChartsData.ts` — uses Refine `useList`
- `src/pages/dashboard/useBudgets.ts` — uses Refine `useList`
- `src/utility/dateRanges.ts` — pure date helper, no Supabase

No work needed for H1. This plan covers H3 + M2 + M1.

---

## File Map

**New files (create):**
- `src/constants/dateOptions.ts` — `currentYear`, `yearOptions`, `monthOptions`
- `src/pages/dashboard/components/TrendBadge.tsx`
- `src/pages/dashboard/components/TypeSummaryCards.tsx`
- `src/pages/dashboard/components/CategoryBreakdownSection.tsx` — contains both `CategoryBreakdownTable` (internal) and the exported `CategoryBreakdownSection`
- `src/pages/dashboard/components/PeriodTab.tsx` — extracted repeated tab content (year selector / month selector / TypeSummaryCards / CategoryBreakdownSection)
- `src/pages/dashboard/components/TrendChart.tsx`
- `src/pages/dashboard/components/SpendingTrendlineChart.tsx`
- `src/pages/dashboard/components/TagBar.tsx`

**Modified files:**
- `src/utility/currency.ts` — fix locale (`"en-US"` → `undefined`); add `makeCurrencyFormatter(currency: string): (value: unknown) => string`
- `src/pages/dashboard/index.tsx` — remove inline components and constants; import from new files; target ≤ 80 lines
- `src/pages/dashboard/ChartsTab.tsx` — remove inline sub-components and constants; import from new files; target ≤ 60 lines
- `src/pages/transactions/create.tsx` — swap `useList + useMemo` for `useSelect` (tags)
- `src/pages/transactions/edit.tsx` — swap `useList + useMemo` for `useSelect` (tags)

---

## Task 1: M2 — Fix `formatCurrency` locale and add `makeCurrencyFormatter`

The existing `formatCurrency` in `src/utility/currency.ts` hard-codes `"en-US"`, but `formatCurrencyLocal` (in `dashboard/index.tsx`) and `CurrencyTooltipFormatter` (in `ChartsTab.tsx`) both use the browser's locale (`undefined`). This task unifies them.

**Files:**
- Modify: `src/utility/currency.ts`

- [ ] **Step 1: Update `formatCurrency` to use browser locale and add `makeCurrencyFormatter`**

Replace the contents of `src/utility/currency.ts` with:

```ts
export const formatCurrency = (
  amount: number | string,
  currency = "USD"
): string => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(num);
};

export const formatAmount = (amount: number | string): string => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toFixed(2);
};

/** Returns a formatter function suitable for Recharts `formatter` prop. */
export const makeCurrencyFormatter =
  (currency: string) =>
  (value: unknown): string =>
    formatCurrency(typeof value === "number" ? value : 0, currency);
```

- [ ] **Step 2: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web-next/src/utility/currency.ts
git commit -m "refactor: fix formatCurrency locale and add makeCurrencyFormatter helper"
```

---

## Task 2: M2 — Create shared `src/constants/dateOptions.ts`

Both `dashboard/index.tsx` and `ChartsTab.tsx` define identical `currentYear`, `yearOptions`, `monthOptions` constants.

**Files:**
- Create: `src/constants/dateOptions.ts`

- [ ] **Step 1: Create the file**

Create `src/constants/dateOptions.ts`:

```ts
import dayjs from "dayjs";

export const currentYear = dayjs().year();

export const yearOptions = Array.from({ length: 6 }, (_, i) => ({
  label: String(currentYear - i),
  value: currentYear - i,
}));

export const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  label: dayjs().month(i).format("MMMM"),
  value: i,
}));
```

Note: `ChartsTab.tsx` uses `"MMM"` (abbreviated) for month labels but `index.tsx` uses `"MMMM"` (full). The full name is better UX; update both consumers to use full names in this step.

- [ ] **Step 2: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web-next/src/constants/dateOptions.ts
git commit -m "refactor: add shared dateOptions constants (yearOptions, monthOptions)"
```

---

## Task 3: H3 — Extract `TrendBadge`

**Files:**
- Create: `src/pages/dashboard/components/TrendBadge.tsx`
- Modify: `src/pages/dashboard/index.tsx`

- [ ] **Step 1: Create `TrendBadge.tsx`**

Create `src/pages/dashboard/components/TrendBadge.tsx`:

```tsx
import { Typography } from "antd";

const { Text } = Typography;

export const TrendBadge = ({
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
```

- [ ] **Step 2: Replace `TrendBadge` in `dashboard/index.tsx`**

In `src/pages/dashboard/index.tsx`:
1. Remove the `TrendBadge` function definition (lines ~56–102)
2. Add import at the top: `import { TrendBadge } from "./components/TrendBadge";`

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/TrendBadge.tsx \
        apps/web-next/src/pages/dashboard/index.tsx
git commit -m "refactor: extract TrendBadge to its own component file"
```

---

## Task 4: H3 — Extract `TypeSummaryCards`

**Files:**
- Create: `src/pages/dashboard/components/TypeSummaryCards.tsx`
- Modify: `src/pages/dashboard/index.tsx`

- [ ] **Step 1: Create `TypeSummaryCards.tsx`**

Create `src/pages/dashboard/components/TypeSummaryCards.tsx`:

```tsx
import { Card, Col, Row, Statistic } from "antd";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TYPE_VALUE_COLORS,
  type TransactionType,
} from "../../../constants/transactionTypes";
import { useCurrency } from "../../../contexts/currency";
import { formatCurrency } from "../../../utility/currency";
import { TrendBadge } from "./TrendBadge";

export interface TypeSummary {
  type: TransactionType;
  total: number;
}

export const TypeSummaryCards = ({
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
                  formatCurrency(typeof value === "number" ? value : 0, currency)
                }
                loading={loading}
                valueStyle={{ color: TYPE_VALUE_COLORS[type] }}
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
              formatCurrency(typeof value === "number" ? value : 0, currency)
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
```

- [ ] **Step 2: Update `dashboard/index.tsx`**

In `src/pages/dashboard/index.tsx`:
1. Remove the `TypeSummaryCards` function definition (lines ~104–181)
2. Remove the `TypeSummary` interface (it's now exported from the component file)
3. Add import: `import { TypeSummaryCards } from "./components/TypeSummaryCards";`
4. The `TypeSummary` type is still imported from `../../hooks` for use in `usePeriodStats` return — keep that import as-is; both types are structurally identical so TypeScript will accept them.

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx \
        apps/web-next/src/pages/dashboard/index.tsx
git commit -m "refactor: extract TypeSummaryCards to its own component file"
```

---

## Task 5: H3 — Extract `CategoryBreakdownSection`

**Files:**
- Create: `src/pages/dashboard/components/CategoryBreakdownSection.tsx`
- Modify: `src/pages/dashboard/index.tsx`

- [ ] **Step 1: Create `CategoryBreakdownSection.tsx`**

Create `src/pages/dashboard/components/CategoryBreakdownSection.tsx`:

```tsx
import { Card, Col, Row, Table, Typography, type TableColumnsType } from "antd";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
} from "../../../constants/transactionTypes";
import { useCurrency } from "../../../contexts/currency";
import { formatCurrency } from "../../../utility/currency";

const { Text, Title } = Typography;

export interface CategorySummary {
  category_name: string;
  type: TransactionType;
  total: number;
}

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
      sorter: (a, b) => a.category_name.localeCompare(b.category_name),
      sortDirections: ["ascend", "descend"],
    },
    {
      title: "Amount",
      dataIndex: "total",
      key: "total",
      sorter: (a, b) => a.total - b.total,
      defaultSortOrder: "descend",
      sortDirections: ["descend", "ascend"],
      render: (value: number) => formatCurrency(value, currency),
      align: "right" as const,
    },
  ];

  return (
    <Table
      dataSource={filteredData}
      columns={columns}
      rowKey={(row) => `${row.type}-${row.category_name}`}
      loading={loading}
      pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
      size="small"
      summary={() => {
        const total = filteredData.reduce((sum, row) => sum + row.total, 0);
        return (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>Total</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>{formatCurrency(total, currency)}</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        );
      }}
    />
  );
};

export const CategoryBreakdownSection = ({
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
```

- [ ] **Step 2: Update `dashboard/index.tsx`**

In `src/pages/dashboard/index.tsx`:
1. Remove `CategoryBreakdownTable` and `CategoryBreakdownSection` definitions (lines ~183–264)
2. Remove `CategorySummary` interface (now exported from the component file)
3. Add import: `import { CategoryBreakdownSection } from "./components/CategoryBreakdownSection";`
4. Remove `import { ..., type CategorySummary, type TypeSummary } from "../../hooks"` — these types are now in the component files. Keep the `usePeriodStats` import.

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/CategoryBreakdownSection.tsx \
        apps/web-next/src/pages/dashboard/index.tsx
git commit -m "refactor: extract CategoryBreakdownSection to its own component file"
```

---

## Task 6: H3 — Extract `PeriodTab` and apply shared date constants to `index.tsx`

The yearly and monthly tab children in `index.tsx` are structurally identical (selector + `TypeSummaryCards` + `CategoryBreakdownSection`). Extract to a single `PeriodTab` component and replace the duplicated `currentYear`/`yearOptions`/`monthOptions` with imports from `src/constants/dateOptions.ts`.

**Files:**
- Create: `src/pages/dashboard/components/PeriodTab.tsx`
- Modify: `src/pages/dashboard/index.tsx`

- [ ] **Step 1: Create `PeriodTab.tsx`**

Create `src/pages/dashboard/components/PeriodTab.tsx`:

```tsx
import { Select, Typography } from "antd";
import { yearOptions, monthOptions } from "../../../constants/dateOptions";
import type { CategorySummary } from "./CategoryBreakdownSection";
import type { TypeSummary } from "./TypeSummaryCards";
import { TypeSummaryCards } from "./TypeSummaryCards";
import { CategoryBreakdownSection } from "./CategoryBreakdownSection";

const { Text } = Typography;

interface PeriodTabProps {
  period: "year" | "month";
  selectedYear: number;
  selectedMonth: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  typeSummary: TypeSummary[];
  previousTypeSummary: TypeSummary[] | null;
  categorySummary: CategorySummary[];
  loading: boolean;
}

export const PeriodTab = ({
  period,
  selectedYear,
  selectedMonth,
  onYearChange,
  onMonthChange,
  typeSummary,
  previousTypeSummary,
  categorySummary,
  loading,
}: PeriodTabProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Text strong>Year:</Text>
      <Select
        value={selectedYear}
        onChange={onYearChange}
        options={yearOptions}
        style={{ width: 120 }}
      />
      {period === "month" && (
        <>
          <Text strong>Month:</Text>
          <Select
            value={selectedMonth}
            onChange={onMonthChange}
            options={monthOptions}
            style={{ width: 150 }}
          />
        </>
      )}
    </div>
    <TypeSummaryCards
      data={typeSummary}
      previousData={previousTypeSummary}
      loading={loading}
    />
    <CategoryBreakdownSection data={categorySummary} loading={loading} />
  </div>
);
```

- [ ] **Step 2: Rewrite `dashboard/index.tsx`**

Replace `src/pages/dashboard/index.tsx` with:

```tsx
import { Card, Tabs } from "antd";
import { Show } from "@refinedev/antd";
import { useState, type FC } from "react";
import dayjs from "dayjs";
import { BudgetsSection } from "./BudgetsSection";
import { ChartsTab } from "./ChartsTab";
import { PeriodTab } from "./components/PeriodTab";
import { usePeriodStats } from "../../hooks";
import { currentYear } from "../../constants/dateOptions";

export const DashboardPage: FC = () => {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());

  const yearDateRange = {
    start: dayjs().year(selectedYear).startOf("year").format("YYYY-MM-DD"),
    end: dayjs().year(selectedYear).startOf("year").add(1, "year").format("YYYY-MM-DD"),
  };

  const monthDateRange = {
    start: dayjs().year(selectedYear).month(selectedMonth).startOf("month").format("YYYY-MM-DD"),
    end: dayjs().year(selectedYear).month(selectedMonth).startOf("month").add(1, "month").format("YYYY-MM-DD"),
  };

  const yearStats = usePeriodStats({ period: "year", startDate: yearDateRange.start, endDate: yearDateRange.end });
  const monthStats = usePeriodStats({ period: "month", startDate: monthDateRange.start, endDate: monthDateRange.end });

  const tabItems = [
    {
      key: "yearly",
      label: "Yearly Statistics",
      children: (
        <PeriodTab
          period="year"
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
          typeSummary={yearStats.typeSummary}
          previousTypeSummary={yearStats.previousTypeSummary}
          categorySummary={yearStats.categorySummary}
          loading={yearStats.loading}
        />
      ),
    },
    {
      key: "monthly",
      label: "Monthly Statistics",
      children: (
        <PeriodTab
          period="month"
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
          typeSummary={monthStats.typeSummary}
          previousTypeSummary={monthStats.previousTypeSummary}
          categorySummary={monthStats.categorySummary}
          loading={monthStats.loading}
        />
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
```

Note: The `Card` import was in the old file but all cards are now inside sub-components. Remove it if unused.

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Run E2E tests**

Ensure the dev server is running (`npm run dev` in `apps/web-next`), then:

```bash
cd apps/web-next && npm run test:e2e:ci
```

Expected: all tests pass (17+ transaction tests + any dashboard tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/PeriodTab.tsx \
        apps/web-next/src/pages/dashboard/index.tsx \
        apps/web-next/src/constants/dateOptions.ts
git commit -m "refactor: extract PeriodTab, reduce dashboard/index.tsx to shell (~55 lines)"
```

---

## Task 7: H3 — Extract `TrendChart` from `ChartsTab.tsx`

**Files:**
- Create: `src/pages/dashboard/components/TrendChart.tsx`
- Modify: `src/pages/dashboard/ChartsTab.tsx`

- [ ] **Step 1: Create `TrendChart.tsx`**

Create `src/pages/dashboard/components/TrendChart.tsx`:

```tsx
import { Card } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
        <BarChart data={data} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={72} />
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
```

- [ ] **Step 2: Remove `TrendChart` from `ChartsTab.tsx`**

In `src/pages/dashboard/ChartsTab.tsx`:
1. Remove the `TrendChart` function definition (~lines 71–117)
2. Remove the `CurrencyTooltipFormatter` function if it's only used by `TrendChart` (it's also used by `SpendingTrendlineChart` and `TagBar` — leave it until those are extracted in Tasks 8 and 9)
3. Add import: `import { TrendChart } from "./components/TrendChart";`

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/TrendChart.tsx \
        apps/web-next/src/pages/dashboard/ChartsTab.tsx
git commit -m "refactor: extract TrendChart component from ChartsTab"
```

---

## Task 8: H3 — Extract `SpendingTrendlineChart` from `ChartsTab.tsx`

**Files:**
- Create: `src/pages/dashboard/components/SpendingTrendlineChart.tsx`
- Modify: `src/pages/dashboard/ChartsTab.tsx`

- [ ] **Step 1: Create `SpendingTrendlineChart.tsx`**

Create `src/pages/dashboard/components/SpendingTrendlineChart.tsx`:

```tsx
import { useState, useMemo, useEffect } from "react";
import { Card, Select, Typography } from "antd";
import { Segmented } from "antd";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TRANSACTION_TYPES,
} from "../../../constants/transactionTypes";
import {
  getMonthKeysInRange,
  formatMonthLabel,
} from "../../../utility/monthHelpers";
import { makeCurrencyFormatter } from "../../../utility/currency";
import type { CategorySpendPoint, TagSpendPoint } from "../../../hooks";

const { Text } = Typography;

const CHART_COLORS = [
  "#1677ff", "#52c41a", "#ff4d4f", "#fa8c16",
  "#722ed1", "#13c2c2", "#eb2f96", "#fadb14",
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
    const itemByMonth: Record<string, Record<string, number>> = {};
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
      for (let i = 0; i < selected.length; i++) {
        row[`k${i}`] = itemByMonth[selected[i]]?.[monthKey] ?? 0;
      }
      return row;
    });

    return { chartData, hasData };
  }, [categorySpendByMonth, endDate, mode, selected, startDate, tagSpendByMonth]);

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
            <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={72} />
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
```

- [ ] **Step 2: Remove `SpendingTrendlineChart` from `ChartsTab.tsx`**

In `src/pages/dashboard/ChartsTab.tsx`:
1. Remove the `SpendingTrendlineChart` function definition (~lines 119–260)
2. Remove the `CHART_COLORS` constant (moved to `SpendingTrendlineChart.tsx`)
3. Add import: `import { SpendingTrendlineChart } from "./components/SpendingTrendlineChart";`

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx \
        apps/web-next/src/pages/dashboard/ChartsTab.tsx
git commit -m "refactor: extract SpendingTrendlineChart component from ChartsTab"
```

---

## Task 9: H3 — Extract `TagBar` and finalize `ChartsTab.tsx`

**Files:**
- Create: `src/pages/dashboard/components/TagBar.tsx`
- Modify: `src/pages/dashboard/ChartsTab.tsx`

- [ ] **Step 1: Create `TagBar.tsx`**

Create `src/pages/dashboard/components/TagBar.tsx`:

```tsx
import { Card, Typography } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { makeCurrencyFormatter } from "../../../utility/currency";

const { Text } = Typography;

export const TagBar = ({
  title,
  data,
  color,
  currency,
}: {
  title: string;
  data: { tag: string; total: number }[];
  color: string;
  currency: string;
}) => {
  const fmt = makeCurrencyFormatter(currency);
  return (
    <Card title={title}>
      {data.length === 0 ? (
        <Text type="secondary">No tagged transactions in this period</Text>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 32, left: 16, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f0f0f0"
              horizontal={false}
            />
            <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="tag" tick={{ fontSize: 12 }} width={96} />
            <Tooltip formatter={fmt} />
            <Bar dataKey="total" fill={color} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};
```

- [ ] **Step 2: Rewrite `ChartsTab.tsx` to be shell-only**

Replace `src/pages/dashboard/ChartsTab.tsx` with:

```tsx
import { useState } from "react";
import { Card, Col, Row, Select, Typography } from "antd";
import dayjs from "dayjs";
import { useCurrency } from "../../contexts/currency";
import { TYPE_VALUE_COLORS, TRANSACTION_TYPES } from "../../constants/transactionTypes";
import { yearOptions, monthOptions } from "../../constants/dateOptions";
import { useChartsData } from "../../hooks";
import { TrendChart } from "./components/TrendChart";
import { SpendingTrendlineChart } from "./components/SpendingTrendlineChart";
import { TagBar } from "./components/TagBar";

const { Text, Title } = Typography;

export const ChartsTab = () => {
  const { currency } = useCurrency();

  const defaultEnd = dayjs();
  const defaultStart = defaultEnd.subtract(5, "month").startOf("month");

  const [startYear, setStartYear] = useState(defaultStart.year());
  const [startMonth, setStartMonth] = useState(defaultStart.month());
  const [endYear, setEndYear] = useState(defaultEnd.year());
  const [endMonth, setEndMonth] = useState(defaultEnd.month());

  const startDate = dayjs().year(startYear).month(startMonth).startOf("month").format("YYYY-MM-DD");
  const endDate = dayjs().year(endYear).month(endMonth).startOf("month").add(1, "month").format("YYYY-MM-DD");

  const { trend, tags, categorySpendByMonth, tagSpendByMonth, loading } =
    useChartsData(startDate, endDate);

  const tagData = (type: (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES]) =>
    tags.filter((t) => t.type === type).slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Date range picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Text strong>From:</Text>
        <Select value={startYear} onChange={setStartYear} options={yearOptions} style={{ width: 100 }} />
        <Select value={startMonth} onChange={setStartMonth} options={monthOptions} style={{ width: 90 }} />
        <Text strong>To:</Text>
        <Select value={endYear} onChange={setEndYear} options={yearOptions} style={{ width: 100 }} />
        <Select value={endMonth} onChange={setEndMonth} options={monthOptions} style={{ width: 90 }} />
      </div>

      {loading ? (
        <Card loading style={{ height: 300 }} />
      ) : (
        <TrendChart data={trend} currency={currency} />
      )}

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

      <div>
        <Title level={5} style={{ marginBottom: 12 }}>By Tag</Title>
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
    </div>
  );
};
```

- [ ] **Step 3: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 4: Run E2E tests**

Ensure dev server is running, then:

```bash
cd apps/web-next && npm run test:e2e:ci
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/src/pages/dashboard/components/TagBar.tsx \
        apps/web-next/src/pages/dashboard/ChartsTab.tsx
git commit -m "refactor: extract TagBar, reduce ChartsTab to shell (~60 lines)"
```

---

## Task 10: M1 — Replace `useList + useMemo` with `useSelect` for tags in `create.tsx`

**Files:**
- Modify: `src/pages/transactions/create.tsx`

- [ ] **Step 1: Identify the lines to change**

In `src/pages/transactions/create.tsx`, find:

```ts
import { useList } from "@refinedev/core";
// ...
const { query: tagsQuery } = useList({
  resource: "tags",
  pagination: { mode: "off" },
  sorters: [{ field: "name", order: "asc" }],
});
const tagOptions = useMemo(
  () =>
    tagsQuery.data?.data?.map((tag) => ({
      label: tag.name as string,
      value: tag.id as string,
    })) ?? [],
  [tagsQuery.data]
);
```

And the JSX:
```tsx
<Select
  mode="multiple"
  options={tagOptions}
  loading={tagsQuery.isLoading}
  placeholder="Select tags"
  ...
/>
```

- [ ] **Step 2: Replace with `useSelect`**

Remove the `useList` import for tags (keep if used elsewhere in the file; otherwise remove), remove the `useMemo` for `tagOptions`, and replace with:

```ts
import { useSelect } from "@refinedev/antd";
// already imported — confirm it's in the import line: `import { Create, useForm, useSelect } from "@refinedev/antd";`

const { selectProps: tagSelectProps } = useSelect({
  resource: "tags",
  optionLabel: "name",
  optionValue: "id",
  pagination: { mode: "off" },
  sorters: [{ field: "name", order: "asc" }],
});
```

Update the JSX:
```tsx
<Select
  mode="multiple"
  {...tagSelectProps}
  placeholder="Select tags"
  filterOption={false}
/>
```

Note: `useSelect` defaults to server-side filtering (`filterOption: false`). Since all tags are loaded at once (`pagination: { mode: "off" }`), add client-side filtering back:
```tsx
<Select
  mode="multiple"
  {...tagSelectProps}
  placeholder="Select tags"
  filterOption={(input, option) =>
    String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
  }
/>
```

- [ ] **Step 3: Remove unused `useMemo` import if no longer used**

Check if `useMemo` is still used elsewhere in `create.tsx`. If not, remove it from the React import.

- [ ] **Step 4: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 5: Run E2E tests**

```bash
cd apps/web-next && npm run test:e2e:ci -- e2e/tests/transactions.spec.ts
```

Expected: all transaction tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-next/src/pages/transactions/create.tsx
git commit -m "refactor(M1): replace useList+useMemo with useSelect for tag options in create"
```

---

## Task 11: M1 — Replace `useList + useMemo` with `useSelect` for tags in `edit.tsx`

**Files:**
- Modify: `src/pages/transactions/edit.tsx`

- [ ] **Step 1: Identify the lines to change**

In `src/pages/transactions/edit.tsx`, find:

```ts
import { useList } from "@refinedev/core";
// ...
const { query: tagsQuery } = useList({
  resource: "tags",
  pagination: { mode: "off" },
  sorters: [{ field: "name", order: "asc" }],
});
const tagOptions = useMemo(
  () =>
    tagsQuery.data?.data?.map((tag) => ({
      label: tag.name as string,
      value: tag.id as string,
    })) ?? [],
  [tagsQuery.data]
);
```

And the JSX:
```tsx
<Select
  mode="multiple"
  options={tagOptions}
  loading={tagsQuery.isLoading}
  placeholder="Select tags"
  ...
/>
```

- [ ] **Step 2: Replace with `useSelect`**

Same pattern as Task 10. Add `useSelect` import (already in `import { Edit, useForm, useSelect } from "@refinedev/antd"`), remove `useList` for tags, remove `tagOptions` `useMemo`:

```ts
const { selectProps: tagSelectProps } = useSelect({
  resource: "tags",
  optionLabel: "name",
  optionValue: "id",
  pagination: { mode: "off" },
  sorters: [{ field: "name", order: "asc" }],
});
```

Update JSX:
```tsx
<Select
  mode="multiple"
  {...tagSelectProps}
  placeholder="Select tags"
  filterOption={(input, option) =>
    String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
  }
/>
```

- [ ] **Step 3: Remove unused imports**

Remove `useList` from `@refinedev/core` import if no longer used in `edit.tsx`. Remove `useMemo` from React import if no longer used.

- [ ] **Step 4: Verify type check passes**

```bash
cd apps/web-next && npm run check-types 2>&1 | tail -5
```

- [ ] **Step 5: Run E2E tests**

```bash
cd apps/web-next && npm run test:e2e:ci -- e2e/tests/transactions.spec.ts
```

Expected: all transaction tests pass including tag persistence tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web-next/src/pages/transactions/edit.tsx
git commit -m "refactor(M1): replace useList+useMemo with useSelect for tag options in edit"
```

---

## Self-Review Checklist

After all tasks, verify:

- [ ] `npm run check-types` is clean
- [ ] `npm run lint` is clean (`cd apps/web-next && npm run lint`)
- [ ] `npm run test:e2e:ci` passes (all tests)
- [ ] `dashboard/index.tsx` is ≤ 60 lines
- [ ] `ChartsTab.tsx` is ≤ 70 lines
- [ ] No `supabaseClient` direct calls were accidentally introduced
- [ ] `formatCurrencyLocal` no longer exists in any dashboard file
- [ ] `CurrencyTooltipFormatter` no longer exists in `ChartsTab.tsx`
- [ ] `yearOptions`/`monthOptions`/`currentYear` are defined only in `src/constants/dateOptions.ts`

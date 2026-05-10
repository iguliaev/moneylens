import { Tabs } from "antd";
import { Show } from "@refinedev/antd";
import { BudgetsSection } from "./BudgetsSection";
import { ChartsTab } from "./ChartsTab";
import { PeriodTab } from "./components/PeriodTab";
import { useState, type FC } from "react";
import dayjs from "dayjs";
import { currentYear } from "../../constants/dateOptions";

export const DashboardPage: FC = () => {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());

  const tabItems = [
    {
      key: "yearly",
      label: "Yearly Statistics",
      children: (
        <PeriodTab
          period="year"
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
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
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
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

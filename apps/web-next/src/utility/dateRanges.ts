import dayjs, { type Dayjs } from "dayjs";

export function getPreviousPeriodRange(
  period: "month" | "year",
  startDate: string,
  endDate: string
): { prevStart: string; prevEnd: string } {
  const unit = period === "year" ? "year" : "month";
  return {
    prevStart: dayjs(startDate).subtract(1, unit).format("YYYY-MM-DD"),
    prevEnd: dayjs(endDate).subtract(1, unit).format("YYYY-MM-DD"),
  };
}

export interface DateRangePreset {
  label: string;
  value: [Dayjs, Dayjs];
}

/**
 * Shortcut ranges for the export RangePicker.
 *
 * Deliberately a function rather than a module-level constant: the ranges are
 * anchored to "now", and a constant would freeze that at module load and go
 * stale in a long-lived tab (see `constants/dateOptions.ts` for that bug).
 */
export function getExportRangePresets(): DateRangePreset[] {
  const today = dayjs();
  const lastMonth = today.subtract(1, "month");
  const lastYear = today.subtract(1, "year");

  return [
    {
      label: "This month",
      value: [today.startOf("month"), today.endOf("month")],
    },
    {
      label: "Last month",
      value: [lastMonth.startOf("month"), lastMonth.endOf("month")],
    },
    {
      // The 3/12 complete calendar months before the current one — consistent
      // with "Last month"/"Last year" excluding the current, incomplete period.
      label: "Last 3 months",
      value: [
        today.subtract(3, "month").startOf("month"),
        lastMonth.endOf("month"),
      ],
    },
    {
      label: "Last 12 months",
      value: [
        today.subtract(12, "month").startOf("month"),
        lastMonth.endOf("month"),
      ],
    },
    {
      label: "This year",
      value: [today.startOf("year"), today.endOf("year")],
    },
    {
      label: "Last year",
      value: [lastYear.startOf("year"), lastYear.endOf("year")],
    },
  ];
}

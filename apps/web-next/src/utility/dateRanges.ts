import dayjs from "dayjs";

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

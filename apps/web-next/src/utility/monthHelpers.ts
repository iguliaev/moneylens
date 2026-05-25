import dayjs from "dayjs";

export const getMonthKeysInRange = (
  startDate: string,
  endDate: string
): string[] => {
  const monthKeys: string[] = [];
  let cursor = dayjs(startDate).startOf("month");
  const rangeEnd = dayjs(endDate).startOf("month");
  while (cursor.isBefore(rangeEnd)) {
    monthKeys.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }
  return monthKeys;
};

export const formatMonthLabel = (month: string) =>
  dayjs(month).format("MMM YY");

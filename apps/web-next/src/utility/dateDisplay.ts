import dayjs from "dayjs";

export const formatDisplayDate = (value?: string | null): string => {
  if (!value) return "—";
  return dayjs(value).format("DD/MM/YYYY");
};

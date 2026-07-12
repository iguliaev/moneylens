import dayjs from "dayjs";

export const formatDisplayDate = (value?: string | null): string => {
  if (!value) return "—";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY") : "—";
};

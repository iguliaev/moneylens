import dayjs, { type Dayjs } from "dayjs";

/**
 * Normalises a stored form value into what antd's DatePicker wants, **without**
 * rewrapping a value that is already a Dayjs.
 *
 * The naive `dayjs(value)` returns a new instance on every render. rc-picker
 * treats a new `value` identity as an external change and throws away whatever
 * the user is part-way through typing — so on a form with any background query
 * still resolving, a typed date silently reverts. Returning the same instance
 * when nothing changed keeps typing stable.
 */
export const toDayjs = (value: unknown): Dayjs | undefined => {
  if (!value) return undefined;
  if (dayjs.isDayjs(value)) return value;
  return dayjs(value as string | number | Date);
};

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

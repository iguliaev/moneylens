export const formatCurrency = (
  amount: number | string,
  currency = "GBP"
): string => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency,
  }).format(num);
};

/** @deprecated Use formatCurrency instead */
export const formatAmount = formatCurrency;

export const TRANSACTION_TYPES = {
  EARN: "earn",
  SPEND: "spend",
  SAVE: "save",
} as const;

export type TransactionType =
  (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

export const TRANSACTION_TYPE_OPTIONS = [
  {
    label: "Earn",
    value: TRANSACTION_TYPES.EARN,
  },
  {
    label: "Spend",
    value: TRANSACTION_TYPES.SPEND,
  },
  {
    label: "Save",
    value: TRANSACTION_TYPES.SAVE,
  },
];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.EARN]: "Earn",
  [TRANSACTION_TYPES.SPEND]: "Spend",
  [TRANSACTION_TYPES.SAVE]: "Save",
};

/** Ant Design tag/text colour for each transaction type. */
export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.EARN]: "green",
  [TRANSACTION_TYPES.SPEND]: "red",
  [TRANSACTION_TYPES.SAVE]: "blue",
};

/** Hex colour values suitable for valueStyle / CSS. */
export const TRANSACTION_TYPE_HEX: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.EARN]: "#3f8600",
  [TRANSACTION_TYPES.SPEND]: "#cf1322",
  [TRANSACTION_TYPES.SAVE]: "#1890ff",
};

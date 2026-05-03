export const TRANSACTION_TYPES = {
  ALL: "all",
  EARN: "earn",
  SPEND: "spend",
  SAVE: "save",
} as const;

export type TransactionType =
  (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

export const TRANSACTION_TYPE_OPTIONS = [
  {
    label: "All",
    value: TRANSACTION_TYPES.ALL,
  },
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
  [TRANSACTION_TYPES.ALL]: "All",
  [TRANSACTION_TYPES.EARN]: "Earn",
  [TRANSACTION_TYPES.SPEND]: "Spend",
  [TRANSACTION_TYPES.SAVE]: "Save",
};

// Named Ant Design colours for Tag, Progress, and other AntD components
export const TYPE_COLORS: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.ALL]: "default",
  [TRANSACTION_TYPES.EARN]: "green",
  [TRANSACTION_TYPES.SPEND]: "red",
  [TRANSACTION_TYPES.SAVE]: "blue",
};

// Hex colours for CSS style properties (e.g. Statistic.valueStyle)
export const TYPE_VALUE_COLORS: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.ALL]: "#000000",
  [TRANSACTION_TYPES.EARN]: "#3f8600",
  [TRANSACTION_TYPES.SPEND]: "#cf1322",
  [TRANSACTION_TYPES.SAVE]: "#1890ff",
};

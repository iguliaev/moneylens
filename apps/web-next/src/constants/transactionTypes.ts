export const TRANSACTION_TYPES = {
  EARN: "earn",
  SPEND: "spend",
  SAVE: "save",
} as const;

// UI-only sentinel value for the "all" view (not stored in database)
export const TRANSACTION_TYPE_ALL = "all" as const;

export type TransactionType =
  (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

export type TransactionTypeOrAll = TransactionType | typeof TRANSACTION_TYPE_ALL;

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

// UI options including "All" (for segmented controls, not for forms)
export const TRANSACTION_TYPE_OPTIONS_WITH_ALL = [
  {
    label: "All",
    value: TRANSACTION_TYPE_ALL,
  },
  ...TRANSACTION_TYPE_OPTIONS,
];

export const TRANSACTION_TYPE_LABELS: Record<TransactionTypeOrAll, string> = {
  [TRANSACTION_TYPES.EARN]: "Earn",
  [TRANSACTION_TYPES.SPEND]: "Spend",
  [TRANSACTION_TYPES.SAVE]: "Save",
  [TRANSACTION_TYPE_ALL]: "All",
};

// Named Ant Design colours for Tag, Progress, and other AntD components
export const TYPE_COLORS: Record<TransactionTypeOrAll, string> = {
  [TRANSACTION_TYPES.EARN]: "green",
  [TRANSACTION_TYPES.SPEND]: "red",
  [TRANSACTION_TYPES.SAVE]: "blue",
  [TRANSACTION_TYPE_ALL]: "default",
};

// Hex colours for CSS style properties (e.g. Statistic.valueStyle)
export const TYPE_VALUE_COLORS: Record<TransactionTypeOrAll, string> = {
  [TRANSACTION_TYPES.EARN]: "#3f8600",
  [TRANSACTION_TYPES.SPEND]: "#cf1322",
  [TRANSACTION_TYPES.SAVE]: "#1890ff",
  [TRANSACTION_TYPE_ALL]: "#000000",
};

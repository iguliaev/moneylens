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

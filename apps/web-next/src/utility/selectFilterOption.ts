import type { DefaultOptionType } from "antd/es/select";

/**
 * antd `filterOption` for selects whose options carry no searchable field
 * beyond their visible label (unlike categories, which also match on a
 * parent-inclusive search text — see `categoryFilterOption`).
 */
export const simpleLabelFilterOption = (
  input: string,
  option?: DefaultOptionType
): boolean =>
  String(option?.label ?? "")
    .toLowerCase()
    .includes(input.toLowerCase());

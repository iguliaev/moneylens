import type { DefaultOptionType } from "antd/es/select";
import type { Tables } from "../types/database.types";

export type Category = Tables<"categories"> & {
  parent?: Pick<Tables<"categories">, "id" | "name"> | null;
  parent_name?: string | null;
  child_count?: number | null;
};

/** True when the category has no children (safe to assign to transactions). */
export const isLeafCategory = (category: Category): boolean =>
  Number(category.child_count ?? 0) === 0;

/**
 * Given a flat list of categories (with child_count populated), returns only
 * leaf categories — i.e. those that can be assigned to transactions.
 */
export const leafCategoriesOnly = (categories: Category[]): Category[] =>
  categories.filter(isLeafCategory);

/**
 * Format a category display label, optionally prefixed with parent name.
 * e.g. "Utilities / Electricity"
 */
export const categoryLabel = (category: Category): string =>
  (category.parent?.name ?? category.parent_name)
    ? `${category.parent?.name ?? category.parent_name} / ${category.name}`
    : category.name;

/** Normalized search text for matching both parent and child terms. */
export const categorySearchText = (category: Category): string => {
  const parent = category.parent?.name ?? category.parent_name ?? "";
  return `${parent} ${category.name}`.trim().toLowerCase();
};

/** Stable key for sorting categories by user-visible hierarchy label. */
export const categorySortKey = (category: Category): string =>
  categoryLabel(category);

/** Comparator for alphabetical ordering by full hierarchy label. */
export const compareCategoriesByHierarchyLabel = (
  a: Category,
  b: Category
): number => {
  const primary = categorySortKey(a).localeCompare(
    categorySortKey(b),
    undefined,
    {
      sensitivity: "base",
    }
  );
  if (primary !== 0) return primary;
  return String(a.id).localeCompare(String(b.id));
};

export interface CategoryOption {
  label: string;
  value: string;
  searchText: string;
}

/**
 * Leaf categories as antd Select options, ordered by hierarchy label. Every
 * category picker in the app shows the same thing, so they all build options
 * through here rather than repeating the filter/sort/map.
 */
export const toLeafCategoryOptions = (
  categories: Category[]
): CategoryOption[] =>
  leafCategoriesOnly(categories)
    .sort(compareCategoriesByHierarchyLabel)
    .map((category) => ({
      label: categoryLabel(category),
      value: category.id,
      searchText: categorySearchText(category),
    }));

/**
 * antd `filterOption` for category selects: matches against the visible label
 * *and* the parent-inclusive search text, so typing a parent name surfaces its
 * children even though the label starts with the parent.
 */
export const categoryFilterOption = (
  input: string,
  option?: DefaultOptionType
): boolean => {
  const normalized = input.toLowerCase();
  const label = String(option?.label ?? "").toLowerCase();
  const searchText =
    typeof option?.searchText === "string" ? option.searchText : "";
  return label.includes(normalized) || searchText.includes(normalized);
};

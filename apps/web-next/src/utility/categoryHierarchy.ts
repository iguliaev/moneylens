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
  categoryLabel(category).toLocaleLowerCase();

/** Comparator for alphabetical ordering by full hierarchy label. */
export const compareCategoriesByHierarchyLabel = (
  a: Category,
  b: Category
): number => categorySortKey(a).localeCompare(categorySortKey(b));

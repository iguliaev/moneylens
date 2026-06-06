import type { Tables } from "../types/database.types";

export type Category = Tables<"categories"> & {
  parent?: Pick<Tables<"categories">, "id" | "name"> | null;
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
 * e.g. "Utilities > Electricity"
 */
export const categoryLabel = (category: Category): string =>
  category.parent?.name
    ? `${category.parent.name} > ${category.name}`
    : category.name;


/**
 * A stored id (a default category/bank account, etc.) can outlive its target —
 * FKs use ON DELETE SET NULL, which only fires on a hard delete, and this app
 * soft-deletes. `*_with_usage` views already exclude soft-deleted rows, so
 * treating "not in options" as "unset" renders a stale reference as empty
 * instead of a raw id.
 */
export const valueIfStillAvailable = (
  id: string | null | undefined,
  options: readonly { value?: unknown }[]
): string | undefined =>
  id && options.some((option) => String(option.value) === id)
    ? id
    : undefined;

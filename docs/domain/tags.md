# Tags

A tag is a per-user, freeform label a transaction can carry — unlike categories, tags are flat
(no hierarchy) and not typed (the same tag can be attached to `earn`, `spend`, and `save`
transactions alike).

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | Owner. |
| `name` | text | Unique per user: `(user_id, name)`. Max 255 chars in the bulk-upload path. |
| `description` | text, nullable | |
| `deleted_at` | timestamptz, nullable | Soft delete. |
| `created_at` / `updated_at` | timestamptz | |

Table: `public.tags`. Read model for the UI: `public.tags_with_usage`, which adds `in_use_count`
(count of live transactions carrying the tag).

## Relationships

- **Transactions**: many-to-many via `transaction_tags` (`transaction_id`, `tag_id`, unique
  pair). A transaction can carry any number of tags, or none. See
  [Transactions](transactions.md#writing-transactions) — tag associations are written
  replace-all, atomically with the transaction itself, by `create_transaction_with_tags` /
  `update_transaction_with_tags`, which both require every tag id to belong to the caller and be
  live.
- **Budgets**: many-to-many via `budget_tags`. See [Budgets](budgets.md#linking-categories-andor-tags)
  — a budget matches a transaction if it carries any of the budget's linked tags, unioned with
  the category match (not double-counted).

## Soft delete

Like categories, `delete_tag_safe(p_tag_id)` exists as a `SECURITY DEFINER` RPC that refuses to
delete (returns `ok = false, in_use_count = N`) if live transactions still carry the tag — but
the web UI's actual delete action doesn't call it. `deleteOne`/`deleteMany` for `tags` go through
the generic soft-delete wrapper (`apps/web-next/src/utility/softDeleteDataProvider.ts`), which
unconditionally sets `deleted_at = NOW()`. The tags list page shows `in_use_count` for
information only. Practical consequence: a tag can be soft-deleted while still attached (via
`transaction_tags`) to existing transactions; re-saving one of those transactions afterward
requires the tag to be live, or it must be dropped from the tag list first (see
[Transactions](transactions.md#writing-transactions)).

## Related

- [Transactions](transactions.md) — how tags are attached and validated.
- [Budgets](budgets.md) — how a linked tag contributes to `current_amount`.
- [`docs/api/bulk-upload.md`](../api/bulk-upload.md) — the `TagInput` schema and import
  validation messages.

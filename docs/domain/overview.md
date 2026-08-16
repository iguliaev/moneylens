# Domain Overview

MoneyLens is a personal finance app: users log **transactions**, organize them with
**categories** and **tags**, and track spending/saving/earning targets with **budgets**. This
folder documents the business rules behind those four concepts — not just the column names (the
migrations are the source of truth for that; see
[`docs/database/schema-and-migrations.md`](../database/schema-and-migrations.md)), but the
invariants a human or an agent needs to hold in mind before touching this data: what must match
what, what's enforced by a trigger vs. only by an RPC vs. not enforced at all, and where the UI's
actual behavior diverges from what a database function would suggest.

## The four concepts, in one paragraph

A **transaction** is a dated `earn`/`spend`/`save` event with an amount, filed under at most one
**category** (of the matching type), tagged with any number of **tags**, and optionally linked to
a bank account. A **category** classifies transactions by type and can be nested one level deep
(a root category with leaf children). A **tag** is a flat, untyped label, freely attachable to
any transaction. A **budget** sets a target amount for one type over an optional date range, and
tracks progress automatically by summing transactions that match a set of linked categories
and/or tags — there's no manual step to "log against" a budget.

| Doc | Covers |
|---|---|
| [Transactions](transactions.md) | Fields, the category-type-match rule, atomic write RPCs, soft delete |
| [Categories](categories.md) | Type, 2-level hierarchy, the `"Parent/Child"` naming convention, soft delete |
| [Budgets](budgets.md) | Category/tag linking, how `current_amount` is computed |
| [Tags](tags.md) | Flat per-user labels, many-to-many with transactions and budgets |

## Cross-cutting rules that apply to all four

These are documented once, in [`docs/database/schema-and-migrations.md`](../database/schema-and-migrations.md),
and apply identically to `transactions`, `categories`, `tags`, `budgets` (and `bank_accounts`,
which this folder doesn't cover as its own doc since it has no rules beyond these):

- **Per-user isolation**: every row has a `user_id`, enforced by RLS and a `BEFORE INSERT`
  trigger that forces `user_id = auth.uid()` server-side.
- **Soft delete**: rows are never hard-deleted from user-facing flows — a `deleted_at` column is
  set instead. Every read (view, RPC, query) must filter `deleted_at IS NULL` itself; there's no
  row-security-level enforcement of that filter. See each concept doc for where this bites in
  practice (categories and tags in particular: soft-deleting one still in use has surprising
  knock-on effects — see [categories.md](categories.md#soft-delete) and
  [tags.md](tags.md#soft-delete)).
- **`SECURITY DEFINER` RPCs own the multi-row writes**: creating/updating a transaction or budget
  touches more than one table (the row itself, plus its tag/category links) in a single atomic
  RPC — see each doc's "Writing" section. Direct table inserts from the client are the exception,
  not the norm, for these two.

## The shared `transaction_type` enum

`earn`, `spend`, `save` — this three-value Postgres enum (`public.transaction_type`) is the
backbone connecting all four concepts. A transaction has one, a category has one (and can only
classify transactions of that same type), and a budget has one (and can only link categories/tags
of that same type). There's no untyped or cross-type entity anywhere in this domain.

## Where the data comes from / goes

- Bulk import (CSV/JSON upload) and JSON export both round-trip through the `bulk_upload_data`
  RPC's payload shape — see [`docs/api/bulk-upload.md`](../api/bulk-upload.md) for the exact
  schema, constraints, and every validation error message for categories, bank accounts, tags,
  and transactions.
- A second, independent producer of that same payload shape exists outside this repo
  (`moneylens-converter-rs`, ODS → JSON) — noted in the bulk-upload doc, relevant if you're
  changing that payload shape.

## For coding agents

If you're implementing a feature or fixing a bug that touches transactions, categories, budgets,
or tags: read the relevant concept doc first. The invariants described here live in Postgres
triggers and `SECURITY DEFINER` functions, not in frontend code — grepping the frontend alone
will not surface them, and getting them wrong (e.g. writing a category without checking its type
against the transaction's type) will fail at the database layer with the exact error messages
quoted in these docs.

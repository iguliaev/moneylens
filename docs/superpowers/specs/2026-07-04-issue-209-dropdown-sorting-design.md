# Issue #209: Parent-aware alphabetical dropdown sorting

**Status:** Done

## Context

Transaction category dropdowns currently fetch categories sorted by raw `name`, then display hierarchical labels as `Parent / Child`. This causes visually incorrect ordering (for example, `Utilities / Heating`, `Vacation`, `Utilities / Water`) because sorting ignores the parent segment. Transaction edit also does not explicitly sort bank accounts.

## Goals

1. Ensure category dropdowns are sorted alphabetically by the full display label (`Parent / Child` when parent exists).
2. Apply the behavior consistently across all category dropdowns in the web app.
3. Ensure bank account dropdown ordering is explicitly alphabetical where missing.

## Non-goals

1. No schema, migration, or backend view changes.
2. No changes to category leaf filtering rules.
3. No change to search behavior beyond preserving compatibility.

## Design

### Shared sorting utility

Add a shared category sort helper in `apps/web-next/src/utility/categoryHierarchy.ts`:

- Build a normalized sort key from display label semantics:
  - with parent: `parent + " / " + child`
  - without parent: `child`
- Compare using locale-aware case-insensitive comparison.

This centralizes ordering logic and avoids duplicated ad-hoc sorting.

### Category dropdown integration

Update category option builders to sort with the shared helper before rendering labels:

- `apps/web-next/src/pages/transactions/create.tsx`
- `apps/web-next/src/pages/transactions/edit.tsx`
- `apps/web-next/src/pages/budgets/create.tsx`
- `apps/web-next/src/pages/budgets/edit.tsx`

Behavior details:

- Keep existing leaf-category filtering on transaction forms.
- Preserve current label format and search text behavior.
- Only ordering changes.

### Bank account dropdown integration

In `apps/web-next/src/pages/transactions/edit.tsx`, add explicit `name ASC` sort configuration for bank account select options to match create flow and avoid backend/default-order drift.

## Data flow

1. Category list is fetched as today.
2. Frontend applies shared comparator using parent-aware label key.
3. Sorted options are mapped to `Select` options and rendered.

No API contract changes.

## Error handling

Sorting is pure in-memory transformation over already-loaded data. Existing loading/error behavior from Refine/Supabase hooks remains unchanged.

## Testing strategy

1. Extend targeted transactions E2E coverage to assert ordering behavior for hierarchy labels in category dropdown.
2. Keep existing hierarchy label/search assertions.
3. Run focused E2E spec(s) touching transaction dropdown behavior.

## Success criteria

1. Hierarchical category options appear in alphabetical order by full label.
2. Siblings under the same parent are contiguous and alphabetically ordered.
3. Bank account dropdown options in transaction edit are alphabetically ordered.

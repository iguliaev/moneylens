# Category Hierarchy Display Design

## Context

Transaction UI currently shows only child category names in key places (transactions list, transaction create/edit category picker, transaction details). This becomes ambiguous when multiple leaves share the same child name under different parents (for example, `Food / Groceries` vs `Vacations / Groceries`).

## Goals

1. Make category context unambiguous in transaction workflows.
2. Keep one consistent display format across list, form, and details.
3. Preserve current behavior for top-level categories.

## Non-goals

1. No changes to category taxonomy logic or validation rules.
2. No redesign of category management pages.
3. No multi-level breadcrumb beyond existing parent-child representation.

## Approved UX Format

Use a single display label everywhere categories appear in transaction workflows:

- Parent exists: `Parent / Child`
- No parent: `Name`

Examples:

- `Vacations / Groceries`
- `Food / Groceries`
- `Salary`

## Surfaces In Scope

1. Transactions list (`pages/transactions/list.tsx`) category column.
2. Transactions create form (`pages/transactions/create.tsx`) category select options and selected value display.
3. Transactions edit form (`pages/transactions/edit.tsx`) category select options and selected value display.
4. Transaction details (`pages/transactions/show.tsx`) category field.

## Design and Component Plan

### Shared Label Formatter

- Keep `categoryLabel` in `utility/categoryHierarchy.ts` as the canonical label formatter.
- Update delimiter to ` / ` to match approved UX.
- Continue null-safe fallback to child name when parent is absent.

### Create/Edit Form Category Options

- Continue pulling categories from `categories_with_usage`.
- Continue leaf filtering via `isLeafCategory`.
- Build select option labels using `categoryLabel(c)` instead of `c.name`.
- Preserve existing edit-mode safeguard that injects current category when it is not in leaf results, and format that injected label with the same formatter.

### Search Behavior

- Search must match both parent and child terms.
- Implement select filtering against a normalized search string containing both parts (for example: `"vacations groceries"`), while still rendering the visible label as `Vacations / Groceries`.

### Transaction Details

- Fetch category with parent relation included (`parent:parent_id(id,name)`).
- Render category with shared `categoryLabel`.
- If parent relation is missing, render child name only.

### Transactions List

- Render category column with the same label format.
- Ensure list data has parent context available for formatting; if current source only exposes child name, adjust selected relation/view payload to include parent name for rendering.

## Data Flow

1. Category data enters transaction UI from list/select queries.
2. UI maps category records through one shared formatter (`categoryLabel`).
3. Rendered output remains identical across list, picker, and details.
4. Search input in pickers uses a normalized parent+child token string.

## Edge Cases and Error Handling

1. Missing parent relation: show child name.
2. Historical category shape changes: keep edit fallback option injection and render best available label.
3. Empty category data during loading: preserve existing loading and skeleton behavior.

## Testing Strategy

1. **Unit-level utility behavior**
   - `categoryLabel` returns `Parent / Child` when parent exists.
   - `categoryLabel` returns child name when parent is null/absent.
2. **Form behavior**
   - Create/edit dropdown options show hierarchy labels for child categories with parents.
   - Search finds by parent term and by child term.
3. **Page behavior**
   - Transactions list category column uses hierarchy format.
   - Transaction details category field uses hierarchy format.

## Success Criteria

1. Users can distinguish similarly named child categories at a glance in all transaction workflows.
2. All in-scope surfaces use one identical category label format.
3. Top-level categories remain readable and unchanged (`Name` only).


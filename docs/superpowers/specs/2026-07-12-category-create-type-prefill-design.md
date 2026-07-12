# Category Create Type Prefill Design

## Goal

Reduce friction when creating categories by preselecting the Type field when the user opens the create page from the Categories list with a tab selected. Keep Type unselected for direct `/categories/create` visits and other navigation paths.

## Scope

In scope:
- Categories list create navigation
- Category create page initial type selection logic
- Initial parent-category dropdown wiring so it works on first render
- Validation guardrails for query params
- Targeted tests for prefill behavior

Out of scope:
- Changing the default tab on the Categories list
- Persisting a global "last used type"
- Inferring type from route history or other pages

## Approach

Use an explicit URL handoff, matching the transaction prefill flow:

1. On the Categories list page, override the Create button so it links to:
   - `/categories/create?source=categories-list&type=<activeType>`
2. On the Category create page, read query params and prefill Type only when:
   - `source === "categories-list"`
   - `type` is a valid category type (`earn | spend | save`)
3. For direct opens or invalid/missing params, keep Type unselected.

This keeps behavior explicit, predictable, and consistent with the existing transactions implementation.

## Component-Level Design

### CategoryList (`pages/categories/list.tsx`)

- Keep the existing segmented filter behavior as-is.
- Add a custom Create button so the current tab type is included in query params.
- Do not change filters, pagination resets, or table behavior.

### CategoryCreate (`pages/categories/create.tsx`)

- Read `source` and `type` from `useSearchParams` (react-router).
- Compute a validated initial type only when the source matches the Categories list and the type is one of the supported values.
- Pass the validated type into form initial values so Type is preselected on first render.
- Drive the parent-category dropdown from the form's current Type value, not from an independent local mirror, so the dropdown is filtered correctly even when Type starts prefilled.
- Keep the existing behavior that clears `parent_id` when Type changes.

## Data Flow

1. User selects a category tab on the Categories list.
2. User clicks Create.
3. Navigation carries explicit context (`source`, `type`) in the query string.
4. Category create form initializes Type when the context is valid.
5. The parent-category dropdown immediately filters to the selected type.
6. User completes the form and saves.

## Error Handling and Safety

- Invalid `type` query value: ignored.
- Missing or unexpected `source`: ignored.
- No fallback inference from location history or heuristics.
- Required Type validation remains the final guard if no valid prefill exists.

## Testing Plan

Add/update targeted e2e coverage for:

1. From Categories list with selected tab:
   - create page opens with matching Type preselected.
2. Direct `/categories/create`:
   - Type is not preselected.
3. Invalid query params:
   - Type is not preselected.
4. Prefilled Type on create:
   - parent-category dropdown is available without needing a manual type change first.

## Trade-offs

- Query params make context explicit and robust across refresh/share.
- URL becomes slightly more verbose, but the behavior stays easy to debug.
- Manual URL editing can trigger prefill, but only through explicit, validated parameters.

## Success Criteria

- Clicking Create from the Categories list preserves the selected tab type into the create form.
- Create from other app pages still requires an explicit type choice.
- Existing create/edit flows and parent-category filtering remain unchanged.

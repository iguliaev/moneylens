# Transaction Create Type Prefill Design

## Goal

Reduce friction when creating transactions by preselecting the Type field when the user enters the create page from the transactions page with a selected type tab (Earn/Spend/Save). Keep Type unselected when navigating from any other context.

## Scope

In scope:
- Transaction list page create navigation
- Transaction create page initial type selection logic
- Validation guardrails for query params
- Targeted tests for prefill behavior

Out of scope:
- Changing default tab behavior on list page
- Inferring type from any page other than transactions list
- Persisting a global "last used type"

## Approach

Use explicit URL context on create navigation:

1. On transactions list page, override create navigation so it links to:
   - `/transactions/create?source=transactions-list&type=<activeType>`
2. On transaction create page, read query params and prefill Type only when:
   - `source === "transactions-list"`
   - `type` is a valid enum value: `earn | spend | save`
3. For direct opens or invalid/missing params, keep Type unselected.

This keeps behavior explicit, predictable, and aligned with existing location-synced list state.

## Component-Level Design

### TransactionList (`pages/transactions/list.tsx`)

- Keep existing segmented filter behavior as-is.
- Add custom create button props for `<List>` so the button includes current tab type in query params.
- Do not change table filters, pagination resets, or other list interactions.

### TransactionCreate (`pages/transactions/create.tsx`)

- Read `source` and `type` from `useSearchParams` (react-router).
- Compute a validated initial type:
  - accepted only when `source` is `transactions-list` and `type` is one of transaction types.
- Apply initial type to form (initial value path) so existing `Form.useWatch("type")` logic automatically loads matching categories.
- Keep Type required rule unchanged.

## Data Flow

1. User selects a type tab on transaction list (already stored in URL filter state).
2. User clicks Create.
3. Navigation carries explicit context (`source`, `type`) in query string.
4. Create form initializes type when context is valid.
5. Category options query runs for that type, user completes form.

## Error Handling and Safety

- Invalid `type` query value: ignored.
- Missing or unexpected `source`: ignored.
- No fallback inference from route history or heuristics.
- Required Type validation remains final guard if no valid prefill exists.

## Testing Plan

Add/update targeted UI/e2e coverage for:

1. From transactions list with selected tab:
   - create page opens with matching Type preselected.
2. Direct `/transactions/create`:
   - Type is not preselected.
3. Invalid query params:
   - Type is not preselected.

## Trade-offs

- Query params make context explicit and robust across refresh/share.
- URL becomes slightly more verbose, but logic stays simple and debuggable.
- Manual URL editing can trigger prefill, but only through explicit, validated parameters.

## Success Criteria

- Clicking Create from transactions list preserves selected tab type into create form.
- Create from other app pages still requires explicit type choice.
- Existing create/edit flows and category filtering remain unchanged.

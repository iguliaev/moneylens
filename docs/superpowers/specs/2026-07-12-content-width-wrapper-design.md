# Content Width Wrapper Design

**Status:** Draft

## Context

The web-next app currently lets several authenticated resource pages expand to the full available viewport width. That makes list, show, create, edit, and settings screens feel wider than the equivalent pages in `apps/finefoods-antd`, where the main content is centered inside a fixed-width wrapper.

## Goals

1. Center the main content for selected MoneyLens pages with a finefoods-style width cap.
2. Apply the change only to transactions, categories, budgets, tags, and settings pages.
3. Leave authentication pages and the dashboard unchanged.
4. Keep the change shared and reusable instead of repeating page-specific width styles.

## Non-goals

1. No redesign of page internals.
2. No changes to dashboard layout.
3. No changes to login/register/forgot-password/update-password pages.
4. No table, form, or card component refactors beyond what is needed for the shared wrapper.

## Proposed Design

Add one shared page wrapper component that constrains width, centers content, and preserves responsive behavior on small screens. Use it only for the selected route groups/pages:

- `transactions`
- `categories`
- `budgets`
- `tags`
- `settings`

The wrapper should behave like the finefoods layout: full width on mobile, centered on larger screens, and capped at a consistent max width. The dashboard and auth routes should continue using their current layout.

## Implementation Notes

- Prefer a single reusable component over duplicated inline styles.
- Apply the wrapper at the route/page boundary so the rest of the page code stays untouched.
- Keep the width value explicit and easy to adjust if the design needs to be nudged later.

## Validation

1. Open the affected list/show/create/edit/settings pages and confirm the content is centered and narrower.
2. Confirm auth pages remain full screen as they are today.
3. Confirm the dashboard layout is unchanged.

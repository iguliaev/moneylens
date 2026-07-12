# Date Locale and Display Format Design

**Status:** Approved

## Context

The web app currently shows date pickers with a Sunday-first calendar and renders several dates in US-style format. The transaction entry flow and the rest of the app should use Monday-first calendars and display dates as `DD/MM/YYYY`.

## Goals

1. Make all Ant Design date pickers start weeks on Monday.
2. Render displayed dates as `DD/MM/YYYY` across the app.
3. Keep stored values unchanged (`YYYY-MM-DD` for form submission and backend storage).

## Non-goals

1. No database changes.
2. No timezone logic changes.
3. No changes to month-based analytics labels.

## Approach

- Set the app-wide Ant Design locale to `en_GB` and apply the matching Day.js locale once at startup.
- Add a shared helper for display-only dates and use it on list/show/header surfaces instead of the default `DateField` rendering.
- Update transaction and budget date pickers to render and select dates in `DD/MM/YYYY` while continuing to serialize to `YYYY-MM-DD`.

## Surfaces In Scope

- App shell locale setup
- Transaction create/edit date picker display
- Budget create/edit date picker display
- Transaction list date column and date filters
- Show pages for transactions, budgets, tags, categories, and bank accounts
- Header search result date text

## Result

Users see Monday-first calendars and consistent `DD/MM/YYYY` dates wherever the app renders dates.

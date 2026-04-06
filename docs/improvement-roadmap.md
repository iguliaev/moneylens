# MoneyLens Web Application — Improvement Roadmap

> To continue in a new session: _"Read `docs/improvement-roadmap.md` and implement the next pending item in Phase N"_

---

## Phase 1: Foundation (Quick wins)

- [x] Fix hardcoded currency — consolidate GBP/USD mismatch, add user currency preference via context/hook
- [x] Fix transaction amount input to use `<InputNumber>` instead of `<Input>`
- [x] Add React error boundaries at layout level and per page
- [x] Consolidate duplicated `TYPE_COLORS` constant into `constants/transactionTypes.ts`
- [x] Fix `ColorModeContext.setMode` — make it accept a string parameter or rename to `toggleMode`
- [x] Standardize tags pagination to `{ mode: "off" }` in `TransactionEdit` (currently uses `pageSize: 1000`)
- [x] Remove unnecessary `import React from "react"` in files that don't use it directly

---

## Phase 2: Visual Identity

- [ ] Design a proper logo (SVG asset) to replace the inline SVG `<text>` in Arial
- [ ] Define custom Ant Design theme tokens (brand colors, typography, spacing)
- [ ] Add a distinctive web font (e.g., DM Sans or Plus Jakarta Sans)
- [ ] Improve dark mode with brand-specific color tokens

---

## Phase 3: Data Visualization

- [ ] Add net income card to dashboard (earnings − spending)
- [ ] Add category donut/pie charts to dashboard
- [ ] Add spending trend line/bar chart (last 6–12 months)
- [ ] Add month-over-month comparison with trend arrows (↑↓) on summary cards
- [ ] Animate budget progress bars
- [ ] Surface unused DB views: `view_tagged_type_totals`, `view_monthly_tagged_type_totals`

---

## Phase 4: Feature Depth

- [ ] Bank account balance tracking (running balance computed from transactions)
- [ ] Tag-based analytics page/section
- [ ] Export transactions to CSV with date range filter
- [ ] Budget trajectory: "at this rate you'll exceed by day X"
- [ ] Recurring transaction support (mark transactions as recurring, upcoming bills dashboard section)
- [ ] User profile page (display name, currency preference, date format, avatar)

---

## Phase 4b: User Settings (Backend)

> **Context**: Currency preference is currently stored in `localStorage` only — it is device-local and lost on sign-in from another device. This phase persists user settings to Supabase so preferences roam with the account.

- [ ] Create `user_settings` table: `user_id` (FK → `auth.users`), `currency` (text, default `'GBP'`), `date_format` (text), `created_at`, `updated_at`
- [ ] Enable RLS on `user_settings` — users can only read/write their own row
- [ ] Create `get_or_create_user_settings()` DB function to upsert the default row on first access
- [ ] Expose settings via a Supabase RPC or direct table read in `CurrencyContext`
- [ ] On app load, fetch settings from DB and seed `CurrencyContext` (fall back to `localStorage` while loading)
- [ ] On currency change in Settings, persist to DB (and keep `localStorage` as offline cache)
- [ ] Extend `user_settings` with `date_format` and wire it to date display across the app

---

## Phase 5: Polish

- [ ] Responsive mobile design (card-based transaction list, collapsible sidebar)
- [ ] Page transitions and micro-interactions
- [ ] Custom empty states with illustrations
- [ ] Register quick-add transaction action in RefineKbar
- [ ] Budget threshold alerts (80% / 100% reached notifications)
- [ ] Improve Settings bulk upload: add CSV support and downloadable JSON template

---

## Code Quality Reference

| Priority | Item | Impact |
|----------|------|--------|
| High | Hardcoded currency (GBP/USD mismatch) | Users see wrong currency |
| High | Amount uses `<Input>` not `<InputNumber>` | Users can submit invalid data |
| High | No error boundaries | App crashes on any component error |
| Medium | Direct supabase calls bypass Refine data layer | Breaks caching/invalidation |
| Medium | Duplicated `TYPE_COLORS` constant (3 places) | Maintenance burden |
| Medium | `ColorModeContext.setMode` ignores its argument | Works by accident |
| Low | Unnecessary `React` imports (React 19 JSX transform) | Clean code |
| Low | Inconsistent pagination config across forms | Code consistency |

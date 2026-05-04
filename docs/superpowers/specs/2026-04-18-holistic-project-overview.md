# MoneyLens — Holistic Project Overview

> Written: 2026-04-18  
> Purpose: Bird's-eye view of the current project state and how the six improvement plans fit together.

---

## What MoneyLens Is

MoneyLens is a personal finance tracker built on:

- **Frontend**: Vite + React 19 + Refine framework + Ant Design 5 (in `apps/web-next/`)
- **Backend**: Supabase (PostgreSQL 17, Auth, RLS, Edge-compatible RPCs)
- **Testing**: Playwright E2E + pgTAP database tests (Vitest not yet set up)

Core user flow: sign in → record transactions (earning / spending / saving) → categorise and tag them → view dashboard analytics (monthly totals, budget progress, spending trendlines) → adjust budgets and categories.

---

## Where the Project Stands Today

Three phases of the internal roadmap are complete:

| Phase | Status | What shipped |
|-------|--------|--------------|
| 1 — Foundation | ✅ Done | Currency context, InputNumber, error boundaries, constants consolidation |
| 2 — Visual Identity | 🔲 Pending | Design tokens, font, dark-mode brand colours |
| 3 — Data Visualisation | ✅ Done | Net income card, trendline chart, MoM comparisons, budget progress bars, Charts tab E2E test |
| 4 / 4b — Feature Depth + Settings | 🟡 Mostly Done | `user_settings` table ✅, KBar quick-add ✅, Settings tabbed layout ✅; CSV export / bank balance / recurring transactions still open |
| 5 — Polish | 🟡 Mostly Done | Empty states ✅, loading skeletons ✅, budget alerts ✅, transaction show skeleton ✅, dashboard monthly default ✅; "All Transactions" view and full-text search still open |

The codebase is functional and tested at the happy-path level, but several structural issues have accumulated that will slow down all future work if left unaddressed.

---

## Six Key Problems Found

The holistic analysis (April 2026) identified six distinct problem areas. Each was turned into a detailed improvement plan.

### 1. Frontend Architecture — code is drifting away from Refine conventions

The dashboard and charts bypass the Refine data layer entirely, calling `supabaseClient.from()` directly. This means cache invalidation never fires, which will cause stale data bugs as the app grows. The dashboard file (`dashboard/index.tsx`) is also a 580-line monolith embedding five components and three hooks. Tag saving after a create/edit form is a fragile post-submit RPC that silently drops tags if it fails.

→ **Plan**: [`2026-04-18-frontend-architecture-plan.md`](./2026-04-18-frontend-architecture-plan.md)  
→ **Roadmap phase it enables**: all phases (structural prerequisite)

---

### 2. Visual Identity — the app has no design language

All colours are hardcoded hex strings spread across four files. There is no shared token system, no custom font, and no real logo (the header uses an inline Arial `<text>` SVG). Dark mode uses AntD defaults with no brand colour overrides. The app looks generic.

→ **Plan**: [`2026-04-18-visual-identity-plan.md`](./2026-04-18-visual-identity-plan.md)  
→ **Roadmap phase it enables**: Phase 2

---

### 3. Feature Completeness — several high-value features are missing

Users cannot export their data, add transactions quickly from the keyboard, set a JSON import template for bulk uploads, or track their bank account balance over time. Recurring transactions and budget trajectory projections (will I exceed my budget?) are also absent. These are standard expectations for a personal finance tool.

→ **Plan**: [`2026-04-18-feature-completeness-plan.md`](./2026-04-18-feature-completeness-plan.md)  
→ **Roadmap phase it enables**: Phase 4 / 4b / 5

---

### 4. Testing Coverage — the most critical SQL logic has zero tests

`get_budget_progress()` is the most complex database function in the codebase (it uses UNION-based deduplication to prevent a transaction matched by both a category and a tag from being double-counted against a budget). It has no pgTAP test. The three `budgets`-related tables added in the last migration (`budgets`, `budget_categories`, `budget_tags`) also have no RLS tests. There is no unit test layer at all — Vitest is not installed.

→ **Plan**: [`2026-04-18-testing-coverage-plan.md`](./2026-04-18-testing-coverage-plan.md)  
→ **Roadmap phase it enables**: cross-cutting (de-risks all future changes)

---

### 5. UX & Interaction — the default experience has rough edges

The dashboard opens on the "All time" tab instead of the current month, which is almost never what a user wants when they open the app. Categories have no icons. Budgets show no alert when a user is at 80 % or 100 % of their limit. The transactions list has no all-time view. Several forms have no empty states (blank screens instead of helpful prompts). These are quick wins — items 1–3 are under 30 lines of code each.

**Progress**: 9 of 11 items shipped (PRs #154–#157, #162, #164, #167, #169). Remaining: "All Transactions" view (#4) and full-text search (#5).

→ **Plan**: [`2026-04-18-ux-interaction-plan.md`](./2026-04-18-ux-interaction-plan.md)  
→ **Roadmap phase it enables**: Phase 5 (polish)

---

### 6. Backend / Database — missing indexes and constraints create future risk

There is no index on `transactions.date`, which is the filter column for every dashboard query. With small data sets this is invisible; with years of user data it becomes a full-table scan. There is no `CHECK (amount > 0)` constraint, so invalid data can enter silently. `user_settings` does not exist yet (currency is `localStorage`-only, lost on sign-in from a new device). Real-time subscriptions are not wired up, so the dashboard does not update when a transaction is added from another tab.

→ **Plan**: [`2026-04-18-backend-db-plan.md`](./2026-04-18-backend-db-plan.md)  
→ **Roadmap phase it enables**: Phase 4b (user settings), general performance

---

## How the Plans Relate to Each Other

```
Backend/DB (foundation)
  └─ user_settings table ──────────────────────────┐
                                                    ▼
Frontend Architecture (structural)            Feature Completeness
  └─ Refine data layer adoption               (CSV export, KBar, recurring)
  └─ Dashboard decomposition                        │
  └─ Atomic tag save                                │
         │                                          │
         ▼                                          ▼
    Testing Coverage ◄──────────────────── UX & Interaction
    (pgTAP budgets P0,                     (quick wins unblock
     Vitest unit, E2E data)                 perception of quality)
         │
         ▼
    Visual Identity
    (design tokens, font — last because
     structural work must stabilise first)
```

**Dependency order for implementation:**

1. **Backend** — `transactions.date` index + `amount CHECK` constraint (one migration, zero risk) → `user_settings` table
2. **Testing** — pgTAP budget tests (P0, no tooling needed, pure SQL)
3. **UX quick wins** — monthly tab default, categories icon, budget 80 % alert (under 1 h total)
4. **Frontend Architecture** — Refine data layer + dashboard decomposition (biggest structural lift)
5. **Feature Completeness** — KBar quick-add, CSV export, JSON template (sprint-sized features)
6. **Visual Identity** — tokens + font (best done after architecture is stable)

---

## Effort vs Impact at a Glance

| Plan | Effort | User Impact | Code Health |
|------|--------|-------------|-------------|
| Backend / DB | Low | Medium | High |
| Testing Coverage | Medium | Low (indirect) | Very High |
| UX quick wins (items 1–3) | Very Low | High | Low |
| Frontend Architecture | High | Low (indirect) | Very High |
| Feature Completeness | Medium–High | Very High | Low |
| Visual Identity | Medium | Medium | Medium |

---

## Where to Start

The UX quick wins (items 1–3, 6–11) have shipped. The three remaining high-value work streams are:

If you want the **fastest visible win**: implement the two remaining UX gaps — "All Transactions" segmented view and notes full-text search — both in `apps/web-next/src/pages/transactions/list.tsx`.

If you want the **highest-risk item removed first**: write the pgTAP tests for `get_budget_progress()` — pure SQL, no frontend changes, prevents silent regressions in the most complex DB function.

If you want the **most durable structural improvement**: adopt the Refine data layer in the dashboard so caching and invalidation work correctly before adding more features on top of the current workaround.

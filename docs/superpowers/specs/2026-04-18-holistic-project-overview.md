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

Four roadmap phases are complete, with Phase 4/4b mostly complete:

| Phase | Status | What shipped |
|-------|--------|--------------|
| 1 — Foundation | ✅ Done | Currency context, InputNumber, error boundaries, constants consolidation |
| 2 — Visual Identity | 🔲 Pending | Design tokens, font, dark-mode brand colours |
| 3 — Data Visualisation | ✅ Done | Net income card, trendline chart, MoM comparisons, budget progress bars, Charts tab E2E test |
| 4 / 4b — Feature Depth + Settings | 🟡 Mostly Done | `user_settings` table ✅, KBar quick-add ✅, Settings tabbed layout ✅; CSV export / bank balance / recurring transactions still open |
| 5 — Polish | ✅ Done (minus one intentional skip) | Empty states ✅, loading skeletons ✅, budget alerts ✅, transaction show skeleton ✅, dashboard monthly default ✅, full-text search + amount range ✅, global header search ✅; "All Transactions" view 🚫 Won't Do |

The codebase is functional and tested at the happy-path level, but several structural issues have accumulated that will slow down all future work if left unaddressed.

---

## Six Key Problems Found

The holistic analysis (April 2026) identified six distinct problem areas. Each was turned into a detailed improvement plan.

### 1. Frontend Architecture — code is drifting away from Refine conventions

The original architecture gaps from April (dashboard monolith, non-atomic tag save flow, and missing Refine-layer consistency) have now been implemented and closed in the frontend architecture workstream (PRs #174–#177). This plan remains relevant as historical context and for future guardrails, but it is no longer an open blocker.

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

The UX rough edges identified in April were addressed through shipped quick wins (monthly dashboard default, categories icon, budget threshold alerts, empty states, skeleton loading, settings layout, full-text search and global header search). The only non-shipped UX item is #4 "All Transactions", intentionally marked 🚫 Won't Do.

**Progress**: 11 of 11 actionable items shipped (PRs #154–#157, #162, #164, #167, #169, #172, #173); item #4 "All Transactions" view remains intentionally skipped.

→ **Plan**: [`2026-04-18-ux-interaction-plan.md`](./2026-04-18-ux-interaction-plan.md)  
→ **Roadmap phase it enables**: Phase 5 (polish)

---

### 6. Backend / Database — missing indexes and constraints create future risk

The highest-priority backend issues from April have been largely addressed (date index added, `user_settings` added with RLS, and budget SQL test coverage substantially improved). Remaining backend work is now mostly incremental hardening/perf follow-ups (for example, additional constraints and real-time subscription wiring).

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

The UX and frontend architecture tracks are now effectively complete. The highest-value remaining work streams are:

If you want the **fastest visible win**: implement visual identity (design tokens + branded theme) from `2026-04-18-visual-identity-plan.md`.

If you want the **highest-value user feature win**: implement one of the remaining feature-completeness items (CSV export, running balance, recurring transactions).

If you want the **highest confidence win**: continue the testing-coverage plan by adding the remaining budget RLS coverage and a unit-test layer (Vitest).

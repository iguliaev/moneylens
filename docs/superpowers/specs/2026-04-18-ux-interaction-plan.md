# MoneyLens — UX & Interaction Design Improvement Plan

> Sorted by **Impact × Simplicity** (highest-value, lowest-effort first).

---

## 1. Dashboard: Default to "Monthly Statistics" Tab ✅ Done — [PR #154](https://github.com/iguliaev/moneylens/pull/154)

**Priority:** 🔴 High Impact / 🟢 Low Complexity — **Quick Win #1**

### Current Experience
`DashboardPage` renders `<Tabs … defaultActiveKey="yearly" />`. Every user who opens the app lands on a year-to-date summary, even though day-to-day use is month-focused.

### Improved Experience
The app opens on "Monthly Statistics", scoped to the current month and year automatically, so users immediately see relevant numbers.

### How to Implement
- In `apps/web-next/src/pages/dashboard/index.tsx`, change the `<Tabs>` prop:
  `defaultActiveKey="yearly"` → `defaultActiveKey="monthly"`
- The `selectedMonth` and `selectedYear` state already default to `dayjs().month()` and `currentYear`, so the current-month data loads without any additional change.

---

## 2. Categories Resource: Add Sidebar Icon

**Priority:** 🔴 High Impact / 🟢 Low Complexity — **Quick Win #2**

### Current Experience
In `App.tsx`, the `categories` resource has **no `meta.icon`**, so it appears in the sidebar as plain text with no icon, visually inconsistent with every other menu item.

### Improved Experience
Categories has a recognisable icon, giving the sidebar a uniform, professional look.

### How to Implement
- Import `AppstoreOutlined` (or `UnorderedListOutlined` / `FolderOutlined`) from `@ant-design/icons` in `App.tsx`.
- Add to the categories resource meta:
  ```tsx
  meta: { label: "Categories", icon: <AppstoreOutlined /> }
  ```

---

## 3. Budget Threshold Alerts (80% / 100% Warning)

**Priority:** 🔴 High Impact / 🟢 Low Complexity — **Quick Win #3**

### Current Experience
`BudgetsSection.tsx` shows a progress bar with status change only at exactly 100%. There is no visual warning between 80–99% — the most actionable window for a user to adjust behaviour.

### Improved Experience
- **≥ 80% (spend budget):** Progress bar turns orange (`strokeColor="#faad14"`); a small `<Tag>` badge reads "⚠ Near limit".
- **≥ 100% (spend budget):** Existing red `"exception"` status plus `<Tag color="error">Over budget</Tag>`.

### How to Implement
In `BudgetsSection.tsx`, derive an alert level before `<Progress>` render:
```
const isSpend = budget.type === "spend";
const alertLevel = percent >= 100 ? "over" : percent >= 80 && isSpend ? "warn" : "none";
```
Use `strokeColor` prop on `<Progress>` for the warning state, and render a conditional `<Tag>` beneath the progress bar.

Also add a compact **"Progress"** column to `BudgetList` with the same colour logic, so budget status is visible at a glance without clicking into each budget.

---

## 4. "All Transactions" View in Transaction List

**Priority:** 🔴 High Impact / 🟡 Medium Complexity

### Current Experience
`TransactionList` passes `transactionType` as a **permanent filter** (`operator: "eq"`). The segmented control only shows Spend / Earn / Save — no way to see all transactions at once.

### Improved Experience
An **"All"** option in the segmented control removes the type filter, showing every transaction with a new "Type" column to differentiate rows.

### How to Implement
1. Change the initial state to a sentinel value: `const [transactionType, setTransactionType] = useState("all")`
2. Make the permanent filter conditional — omit it when `transactionType === "all"`
3. Add `"All"` as the first option in the `<Segmented>` options array
4. When `"all"` is active, render a Type column with a coloured tag
5. Remove the type filter from `categorySelectProps` `useSelect` when `"all"` is active

---

## 5. Full-Text Search in Transaction List (Notes / Amount Range)

**Priority:** 🔴 High Impact / 🟡 Medium Complexity

### Current Experience
Column-level filter dropdowns exist for date, category, amount (exact match), bank account, and tags — but **no free-text search** on `notes`, and the amount filter is useless as an exact match.

### Improved Experience
A search bar above the table filters across `notes` using `containsi`. Amount filter becomes a min/max range.

### How to Implement
- Add a debounced `searchQuery` state and pass it to `useTable` as `{ field: "notes", operator: "containsi", value: searchQuery || undefined }`.
- Render `<Input.Search>` in the `<List headerButtons>` slot.
- Replace the `<InputNumber>` in the amount filter with two `<InputNumber>` fields (Min/Max) using `operator: "between"` — mirroring the existing date range pattern.

---

## 6. Register KBar Quick-Add Transaction Action

**Priority:** 🟡 Medium Impact / 🟢 Low Complexity — **Quick Win #4**

### Current Experience
`<RefineKbar>` is set up but no custom actions are registered — the palette only shows auto-generated navigation shortcuts.

### Improved Experience
Pressing Cmd+K and typing "add" shows an **"Add Transaction"** action that navigates to `/transactions/create`.

### How to Implement
Create `src/hooks/useQuickActions.ts` using `useRegisterActions` from `@refinedev/kbar`:
```ts
useRegisterActions([{
  id: "add-transaction",
  name: "Add Transaction",
  keywords: "new transaction add spend earn save",
  perform: () => create("transactions"),
  section: "Quick Actions",
  priority: Priority.HIGH,
}], []);
```
Call `useQuickActions()` inside the authenticated layout (e.g., in `Header`).

---

## 7. Transaction Show Page: Replace "Loading…" with Skeleton

**Priority:** 🟡 Medium Impact / 🟢 Low Complexity — **Quick Win #5**

### Current Experience
`TransactionShow` renders inline `<>Loading...</>` strings while `categoryIsLoading` and `bankAccountIsLoading` are true, causing jarring text flickers.

### Improved Experience
Each loading field renders `<Skeleton.Input active size="small" />` maintaining layout during data fetch.

### How to Implement
In `transactions/show.tsx`, replace `Loading...` strings with `<Skeleton.Input active size="small" style={{ width: 120 }} />`.

Also fix the hardcoded `"GBP"` currency on line 42 — replace with `useCurrency()`.

---

## 8. Budget List: Inline Progress Column

**Priority:** 🟡 Medium Impact / 🟡 Medium Complexity

### Current Experience
`BudgetList` shows Name, Type, Target, Dates, Category/Tag counts — no visual progress indicator. Users must click "Show" to see spending vs target.

### Improved Experience
A **"Progress"** column renders a compact `<Progress>` bar with colour coding (matching `BudgetsSection` logic).

### How to Implement
- Verify `budgets_with_linked` view returns `current_amount`; if not, extend the view.
- Add a Progress column computing `Math.round((current_amount / target_amount) * 100)` with the same threshold colour logic as item #3.

---

## 9. Empty States with Custom CTAs

**Priority:** 🟡 Medium Impact / 🟡 Medium Complexity

### Current Experience
All list pages show Ant Design's default `<Empty description="No Data" />` — no context, no call to action.

### Improved Experience
Each list page shows a tailored empty state with a contextual CTA ("Add Transaction", "Create Budget", etc.).

### How to Implement
Create a reusable `<EmptyState title description actionLabel onAction />` component in `src/components/EmptyState.tsx`, using AntD's `<Empty>` with the CTA wired to Refine's `useNavigation().create`. Pass it via each `<Table>`'s `locale.emptyText` prop.

---

## 10. Settings Page: Tabbed Layout

**Priority:** 🟡 Medium Impact / 🟡 Medium Complexity

### Current Experience
The Settings page is a single vertically scrolling page with all sections stacked with `<Divider>`. Destructive actions (data reset) are reachable by scrolling past normal content.

### Improved Experience
Settings are grouped into logical tabs: **General** | **Import & Export** | **⚠ Danger Zone**. The danger tab requires deliberate navigation.

### How to Implement
In `pages/settings/index.tsx`, wrap existing section components in `<Tabs>` items and extract each into a named sub-component.

---

## 11. Loading Skeletons for List Pages

**Priority:** 🟡 Medium Impact / 🔴 High Complexity

### Current Experience
`useTable` shows an overlay spinner on `loading: true`. Page transitions are abrupt.

### Improved Experience
Each list renders skeleton rows during initial load, giving a stable, content-shaped placeholder.

### How to Implement
Create a `<TableSkeleton columns={N} rows={8} />` component using `<Skeleton.Input>` blocks. Conditionally render when `tableProps.loading && !tableProps.dataSource?.length`.

---

## Summary Table

| # | Improvement | Impact | Complexity | Rough Effort |
|---|-------------|--------|------------|-------------|
| 1 | Dashboard defaults to Monthly tab | 🔴 High | 🟢 Low | 1 line |
| 2 | Categories sidebar icon | 🔴 High | 🟢 Low | 3 lines |
| 3 | Budget threshold alerts (80%/100%) | 🔴 High | 🟢 Low | ~30 lines |
| 4 | "All Transactions" segmented option | 🔴 High | 🟡 Medium | ~40 lines |
| 5 | Notes full-text search + amount range | 🔴 High | 🟡 Medium | ~50 lines |
| 6 | KBar quick-add transaction action | 🟡 Medium | 🟢 Low | ~20 lines |
| 7 | Transaction show: Skeleton loading | 🟡 Medium | 🟢 Low | ~10 lines |
| 8 | Budget list: inline progress column | 🟡 Medium | 🟡 Medium | ~30 lines |
| 9 | Empty states with CTA | 🟡 Medium | 🟡 Medium | ~60 lines |
| 10 | Settings: tabbed layout | 🟡 Medium | 🟡 Medium | ~40 lines |
| 11 | List page loading skeletons | 🟡 Medium | 🔴 High | ~100 lines |

**Items 1–3** can ship in a single PR in under an hour. **Items 4–7** are self-contained and can be parallelised. **Items 8–11** suit a dedicated UX sprint.

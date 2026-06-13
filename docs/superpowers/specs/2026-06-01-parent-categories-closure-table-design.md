# Parent Categories via Closure Table (Design Spec)

Date: 2026-06-01  
Status: Implemented — PR [#189](https://github.com/iguliaev/moneylens/pull/189) · 2026-06-13

## 1. Goal

Introduce parent categories so users can organize categories hierarchically and get rollup reporting totals, while keeping transaction categorization strict and clean:

- Transactions are assigned to **leaf categories only**
- Category hierarchy is limited to **2 levels** in this phase (Parent -> Child)
- Budget behavior remains **unchanged** in this phase

## 2. Scope

In scope:

- Category hierarchy data model using closure table
- Category create/edit/delete behavior with hierarchy integrity
- Category list and transaction category picker updates
- Parent rollup reporting queries
- Bulk upload compatibility with hierarchy-aware categories
- Database and UI test coverage for new behavior

Out of scope:

- Parent-aware budget links/aggregation
- Automatic migration/renaming of existing slash-style names
- Deep hierarchy UX beyond two levels

## 3. Chosen Approach

Chosen: **Closure table** (`category_hierarchy`) with explicit ancestor/descendant links.

Rationale:

- Strong model for rollups and future deeper hierarchies
- Simple read path for parent aggregation
- Clear integrity boundaries between category records and hierarchy graph

## 4. Data Model

### 4.1 Categories table

`public.categories` remains the source of category records.

### 4.2 New hierarchy table

Add `public.category_hierarchy`:

- `ancestor_id uuid not null references public.categories(id) on delete cascade`
- `descendant_id uuid not null references public.categories(id) on delete cascade`
- `depth int not null` (`0` for self, `1` for direct child in this phase)
- Primary key: `(ancestor_id, descendant_id)`
- Indexes:
  - `(ancestor_id, depth)`
  - `(descendant_id, depth)`

### 4.3 Invariants

- Every category has self-link row: `(id, id, 0)`
- Parent-child relation adds row: `(parent_id, child_id, 1)`
- No cycles
- Max depth is 2 levels in this phase

## 5. Write Operations and Integrity

### 5.1 Create category

1. Insert into `categories`
2. Insert self-link into `category_hierarchy`
3. If parent provided:
   - Validate parent is valid and not self
   - Validate depth constraint (result remains <= 2)
   - Insert parent-child link row

### 5.2 Update parent

When setting/changing parent:

1. Validate no cycle
2. Validate resulting depth <= 2
3. Rebuild hierarchy links for target category (for two-level model this is direct and bounded)

### 5.3 Delete behavior

- Block deleting a parent that still has child categories, unless children are reassigned or detached first
- Cascade removes hierarchy rows for deleted category

## 6. Transaction Categorization

Transactions remain single-category (`category_id`) and **leaf-only**:

- Category picker must only allow categories with no depth-1 descendants
- Validation enforces selected category is leaf at write time

### 6.1 Bulk upload behavior

Existing bulk upload functionality must be preserved and remain operational with hierarchy support:

- Uploaded rows must map category using **leaf category name only**
- If a category name resolves to a parent (non-leaf), the row is rejected with a clear validation error
- If a category name is unknown, the row is rejected using existing invalid-category handling
- No parent/child path syntax is required in this phase

## 7. Reporting and Rollups

Parent totals are computed by joining through closure table:

- For parent `P`, aggregate transactions where
  `transactions.category_id = category_hierarchy.descendant_id`
  and `category_hierarchy.ancestor_id = P`

This supports:

- Parent totals (e.g., `Utilities`)
- Child breakdown (e.g., `Electricity`, `Water`)

## 8. UI Changes

### 8.1 Category pages

- Create/Edit: optional parent selection
- List/Show: present hierarchy clearly (grouped/indented)

### 8.2 Transaction pages

- Category selector filtered to leaves only

## 9. Budgets (Explicit Non-Goal in This Phase)

Budget logic remains as-is, linking directly to category IDs without parent expansion.

## 10. Testing Strategy

Database tests:

- Self-link creation
- Parent-child link creation
- Cycle prevention
- Max-depth enforcement
- Parent rollup correctness

UI/E2E tests:

- Assign parent to category in create/edit flows
- Transaction category picker excludes parent categories
- Reporting shows parent rollup with child breakdown
- Bulk upload accepts valid leaf category names and rejects parent category names

## 11. Risks and Mitigations

- Risk: hierarchy corruption from partial writes  
  Mitigation: perform hierarchy updates in transactional functions/RPCs

- Risk: user confusion assigning transactions to parents  
  Mitigation: leaf-only picker + explicit validation error

- Risk: future budget expectations for parent behavior  
  Mitigation: document phase boundary and schedule budget enhancement separately

# JSON export/import as full system restore — design note & compatibility assessment

**Date:** 2026-08-10
**Status:** Not started (design decision + assessment only; no implementation tasks below have landed)
**Source:** Follow-up to [`2026-08-01-json-category-hierarchy-import-export.md`](2026-08-01-json-category-hierarchy-import-export.md) and PR #266 (JSON export now includes the full `categories`/`bank_accounts`/`tags` library with descriptions, not just names derived from exported transactions).
**Scope:** Lock in the requirement that a JSON export, paired with a fresh/reset account, must reproduce the entire account state — not just transactions. Assess whether the schema this implies is compatible with the schema already used for `bulk_upload_data`, whose payloads today come from two producers: this app's own JSON export, and the separate `moneylens-converter-rs` utility (ODS → JSON). CSV export is explicitly out of scope — it has never carried anything but transaction rows and isn't expected to.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-08-10** — Doc created at the user's request, alongside a compatibility assessment (see below). No code changes in this session. Captures a real gap: budgets have no representation anywhere in `bulk_upload_data` or JSON export today.

---

## Decision: JSON export/import is a full restore, CSV is not

**The requirement, as stated by the user:** exporting to JSON and re-importing that file (into an empty/reset account) should be treated as a **system restore** — everything the user can see about their data model should survive the round trip: transactions (including notes), tags (including descriptions), bank accounts (including descriptions), categories (including descriptions and parent/child hierarchy), and budgets. This is explicitly a JSON-only guarantee; CSV export has never carried anything beyond flat transaction rows and this doc doesn't change that.

This reframes what "the JSON export/import schema" is for. It has, so far, evolved feature-by-feature (transactions → categories → full category/account/tag library with descriptions, across the three plans referenced above). This doc's purpose is to name the destination explicitly so future schema changes get measured against it, and to check that destination doesn't conflict with the schema's second, external producer.

## Where the round trip stands today (after PR #266)

| Entity | Export includes | Import (`bulk_upload_data`) accepts | Restore-complete? |
|---|---|---|---|
| Transactions | date, type, amount, category path, bank_account, tags, notes | same, all optional except date/type/amount | Yes |
| Categories | type, name, description, parent | same (`CategoryInput.parent` added 2026-08-01) | Yes |
| Bank accounts | name, description | name, description | Yes |
| Tags | name, description | name, description | Yes |
| Budgets | **not exported** | **no `budgets` section exists in `bulk_upload_data` at all** | **No — full gap** |

Budgets (`budgets` table: `name`, `type`, `target_amount`, `start_date`, `end_date`, `description`, plus many-to-many links to categories via `budget_categories` and tags via `budget_tags`) have no representation on either side. This is the one place the "everything survives the round trip" goal is not met, and it's a gap in both directions (export doesn't emit them, import has nowhere to put them).

**Also worth naming as a restore-semantics gap, not a schema gap:** `bulk_upload_data` never upserts — `transactions_inserted` is "always insert" per `docs/api/bulk-upload.md`'s Idempotency table, and categories/bank_accounts/tags are `ON CONFLICT DO NOTHING` (skip, not update). So "restore" isn't a property of the import call in isolation — re-importing into a non-empty account creates duplicate transactions. The existing Danger Zone `resetUserData` RPC (wired up in `apps/web-next/src/pages/settings/index.tsx`) is what makes a JSON export a true restore: the supported restore workflow is **reset, then import**, not "import" alone. If this doc's requirement is taken literally as a product feature (a single "Restore from backup" button), that pairing needs to be explicit in the UI, not just an implied two-step manual process.

## Compatibility assessment: does this conflict with the `moneylens-converter-rs`-sourced schema?

**Context supplied by the user:** `bulk_upload_data`'s payload schema is also the target format for a separate utility, `moneylens-converter-rs`, which converts multi-sheet OpenDocument (ODS) spreadsheets into JSON matching this same shape — but with fewer fields available, since an ODS workbook doesn't carry tag descriptions, bank account descriptions, category descriptions, or budgets at all.

**Finding: no conflict, and none is expected going forward, as long as one rule holds.** Every field this app's JSON export has ever added — `categories[].description`, `categories[].parent`, `bank_accounts[].description`, `tags[].description` — was added as **optional** on the `bulk_upload_data` side first (see `docs/api/bulk-upload.md`'s `CategoryInput`/`BankAccountInput`/`TagInput`: only `name` and, for categories, `type` are required). A `moneylens-converter-rs` payload that omits `description` entirely, or omits a `categories`/`bank_accounts`/`tags` section altogether, is already a valid subset of the schema and needs no converter-side change to keep working. The two producers aren't required to emit the same shape — they're required to emit shapes the same *consumer* (`insert_categories`/`insert_bank_accounts`/`insert_tags`/`bulk_insert_transactions`) accepts, and optionality is what makes that possible without coordinating a release between two separate codebases.

**The rule to hold going forward:** any field added to satisfy "full restore" (starting with a future `budgets` section) must be **additive and optional** at the `bulk_upload_data` level — a new top-level `budgets?: BudgetInput[]` key that `moneylens-converter-rs` simply never emits, not a change to the meaning or requiredness of an existing field. Under that rule, `moneylens-converter-rs` doesn't need to be updated in lockstep with this app's export schema; it only needs updating if someone chooses to *add* budget support to the ODS conversion, which is a separate, external decision outside this repo's control. If that rule is ever violated (e.g. a field changes from optional to required, or an existing field's meaning changes), a `moneylens-converter-rs`-sourced payload would silently start failing validation — that's the one thing to watch for in future schema changes here.

**Caveat:** this assessment is based on `moneylens-converter-rs`'s described output shape as relayed by the user, not by reading that tool's source (it lives outside this repository). If its actual output schema differs from "categories/bank_accounts/tags/transactions, same shape as `BulkUploadPayload`, minus description/parent/budgets," this assessment should be re-verified directly against that tool.

---

## Implementation order

Nothing in this doc has been implemented yet — this session was documentation only, at the user's request. Future work, if picked up:

- [ ] 1. Design a `budgets` section for both JSON export and `bulk_upload_data` (new `BudgetInput` with `name`, `type`, `target_amount`, `start_date?`, `end_date?`, `description?`, `categories?: string[]`, `tags?: string[]` — resolved the same way transactions resolve `category`/`bank_account`/`tags`, against the same-payload `categories`/`tags` sections or existing live rows)
- [ ] 2. Migration: new `insert_budgets` helper (mirroring `insert_categories`/`insert_bank_accounts`/`insert_tags`) plus wiring into `bulk_upload_data`, with pgTAP coverage
- [ ] 3. `apps/web-next/src/utility/exportMetadata.ts`: fetch budgets (+ linked category/tag names) from `budgets_with_linked` (already exists, per `database.types.ts`) alongside the existing three metadata queries
- [ ] 4. `apps/web-next/src/utility/jsonExport.ts`: add `budgets` to `JsonExportPayload`, following the same "full library, optional description" shape as categories/bank_accounts/tags
- [ ] 5. `docs/api/bulk-upload.md`: document `BudgetInput`, its validation/error messages, and update the "full restore" framing in the FAQ
- [ ] 6. Decide whether "restore" becomes an explicit product feature (a single guided reset+import flow in Settings) or stays the current implicit two-step (manual reset, then manual import) — this is a product decision, not purely technical, and belongs in its own plan if pursued
- [ ] 7. If pursuing item 6, add e2e coverage for the full round trip: export everything → reset → import → diff against a snapshot taken before reset

## Critical files

- `docs/api/bulk-upload.md` — payload schema source of truth; any `budgets` addition documents here first
- `apps/web-next/src/utility/jsonExport.ts`, `exportMetadata.ts` — export side
- `apps/web-next/src/utility/rpc.ts` — `BulkUploadPayload`/`CategoryInput`/etc. TypeScript types, `resetUserData`
- `apps/web-next/src/pages/settings/index.tsx` — Import & Export UI, Danger Zone reset UI
- `supabase/migrations/` — wherever `insert_categories`/`insert_bank_accounts`/`insert_tags`/`bulk_upload_data` currently live, for the future `insert_budgets` addition
- Database: `budgets`, `budget_categories`, `budget_tags`, `budgets_with_linked` (view)

## Verification plan

For this session: none — no code changed. For future work items above, once picked up:
1. `supabase test db` — new pgTAP coverage for `insert_budgets`
2. `cd apps/web-next && npm run test:unit` — updated `jsonExport.test.ts`/`exportMetadata.test.ts`
3. Manual: export JSON from an account with at least one budget (linked to a category and a tag), reset the account, re-import the export, confirm the budget and its links reappear identically
4. Re-confirm the compatibility assessment above by locating and reading `moneylens-converter-rs`'s actual output schema, if/when it's accessible from this environment

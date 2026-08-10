# JSON export/import as full system restore — design note & compatibility assessment

**Date:** 2026-08-10
**Status:** Not started (design decision + assessment only; no implementation tasks below have landed)
**Source:** Follow-up to [`2026-08-01-json-category-hierarchy-import-export.md`](2026-08-01-json-category-hierarchy-import-export.md) and PR #266 (JSON export now includes the full `categories`/`bank_accounts`/`tags` library with descriptions, not just names derived from exported transactions).
**Scope:** Lock in the requirement that a JSON export, paired with a fresh/reset account, must reproduce the entire account state — not just transactions. Assess whether the schema this implies is compatible with the schema already used for `bulk_upload_data`, whose payloads today come from two producers: this app's own JSON export, and the separate `moneylens-converter-rs` utility (ODS → JSON). CSV export is explicitly out of scope — it has never carried anything but transaction rows and isn't expected to.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-08-10** — Verified the compatibility assessment below directly against `moneylens-converter-rs`'s source (`../moneylens-converter-rs` on disk), rather than relying on the user's description alone. Conclusion unchanged (no conflict), but two things updated: (1) `description` is emitted as an explicit `"description": null`, not omitted — corrected below, doesn't change the compatibility conclusion; (2) the two repos turned out to already be coordinated in practice — `moneylens-converter-rs` has its own tracked, completed plan (`docs/plans/bulk-upload-category-parent-compat.md`, PR #8) that ported this repo's `2026-08-01` `CategoryInput.parent` addition. Reframed the "rule to hold going forward" accordingly.
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

**Context:** `bulk_upload_data`'s payload schema is also the target format for a separate utility, `moneylens-converter-rs` (sibling repo, `../moneylens-converter-rs`), which converts multi-sheet OpenDocument (ODS) spreadsheets into JSON matching this same shape — but with fewer fields available, since an ODS workbook doesn't carry tag descriptions, bank account descriptions, category descriptions, or budgets at all. **Verified directly against that repo's source** (`src/payload/types.rs`, `src/payload/builder.rs`, `docs/plans/bulk-upload-category-parent-compat.md`), not just the user's description of it.

**Finding: no conflict today, confirmed by reading the source.**

- `payload::types::Category`/`BankAccount`/`Tag` all declare `description: Option<String>` — the field exists structurally — but every construction site in `builder.rs` (5 of them, covering root categories, nested-category parents and children, bank accounts, and tags) hardcodes `description: None`. There is no code path anywhere in the converter that ever sets a real description; it's a `moneylens-converter-rs` limitation (ODS has no description column/sheet), not a bug or a schema mismatch to fix here.
- **Correction to this doc's original wording:** those `None` values are **not omitted** from the output JSON — `description` has no `#[serde(skip_serializing_if = ...)]`, so every emitted category/bank_account/tag carries an explicit `"description": null`. This is functionally identical for `bulk_upload_data`, which reads fields via `elem->>'description'` in `jsonb` — that returns SQL `NULL` for both an absent key and an explicit JSON `null` — so the compatibility conclusion is unchanged. Worth being precise about it anyway, since a hypothetical future import-side parser that distinguishes "key present with `null`" from "key absent" could observe the difference; `bulk_upload_data` today does not.
- Zero occurrences of the word "budget" anywhere in `moneylens-converter-rs`'s source or docs — budgets are a full gap on the producer side too, consistent with this doc's gap analysis above. There's no ODS data source for them regardless, so adding a `budgets` section to `bulk_upload_data`/JSON export doesn't require (and can't be satisfied by) any converter-side change.
- Every field this app's JSON export has added — `categories[].description`, `categories[].parent`, `bank_accounts[].description`, `tags[].description` — is **optional** on the `bulk_upload_data` side (see `docs/api/bulk-upload.md`'s `CategoryInput`/`BankAccountInput`/`TagInput`: only `name`, and for categories `type`, are required). A converter payload that always sends `description: null` and, as of its own `parent` support below, sometimes omits `parent`, is a valid payload under that schema.

**Correction to this doc's original framing — the two repos are not independently-evolving strangers, they're actively kept in sync by whoever maintains both.** `moneylens-converter-rs` has its own completed, tracked plan — `docs/plans/bulk-upload-category-parent-compat.md`, status "Complete", shipped via `moneylens-converter-rs` PR #8 — whose entire purpose was porting this repo's `2026-08-01` `CategoryInput.parent` addition (from [`2026-08-01-json-category-hierarchy-import-export.md`](2026-08-01-json-category-hierarchy-import-export.md)) into the converter: it now splits a `"Parent/Child"` transaction category into a root `Category` entry plus a child entry carrying `parent`, deduped by `(type, parent, name)` — the same rule `bulk_upload_data` expects. That plan doc's own "Out of scope" section explicitly notes: *"Server-side 'explicit entry wins over auto-derived parent' behavior (for `description`) doesn't apply here — the converter never sets category descriptions."* — i.e. the converter maintainer already made the same "descriptions are structurally optional and converter-side N/A" call this doc arrives at independently.

**Revised rule going forward:** additivity/optionality (new fields and sections must be optional at the `bulk_upload_data` level) is still the hard requirement — it's what lets the converter emit a valid payload without being updated the same day the schema changes. But *in practice*, don't assume "optional" means "no action needed" is the end of the story: when this schema gains a field the converter *could* plausibly populate (as `parent` was, from ODS's own `"Parent/Child"`-style category strings), the precedent set by PR #8 is that it gets ported over in its own tracked plan on the converter side, keeping both producers' output equally rich rather than letting the converter permanently lag. A future `budgets` section doesn't fit that precedent, since ODS has no budget data to port — that gap is structural, not a lagging-sync problem.

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
- `../moneylens-converter-rs/src/payload/types.rs`, `builder.rs` — the other `bulk_upload_data` producer; check these whenever the payload schema changes here
- `../moneylens-converter-rs/docs/plans/bulk-upload-category-parent-compat.md` — precedent for how a schema addition here (`CategoryInput.parent`) got ported to the converter

## Verification plan

For this session: no code changed; verification was reading `moneylens-converter-rs`'s source directly to confirm the compatibility assessment (see Progress Log). For future work items above, once picked up:
1. `supabase test db` — new pgTAP coverage for `insert_budgets`
2. `cd apps/web-next && npm run test:unit` — updated `jsonExport.test.ts`/`exportMetadata.test.ts`
3. Manual: export JSON from an account with at least one budget (linked to a category and a tag), reset the account, re-import the export, confirm the budget and its links reappear identically
4. ~~Re-confirm the compatibility assessment above by locating and reading `moneylens-converter-rs`'s actual output schema~~ — done this session (2026-08-10), see Progress Log and the Compatibility assessment section above. Re-verify again only if `moneylens-converter-rs`'s payload shape changes.

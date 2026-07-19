# Security review fixes — implementation plan

**Date:** 2026-07-18
**Source:** `docs/superpowers/plans/2026-07-18-project-review-security-code-ux.md` §1 (Security review)
**Scope:** S1–S4 ("should fix") and the four "worth doing" security items from that review. Code-quality (§2) and UX (§3) findings from the same review are out of scope here.

All findings below were re-verified directly against the current repo (not just trusted from the review doc) — exact file paths, line numbers, and current SQL/TS were pulled fresh as of this date.

---

## Should-fix items

### ✅ Done — S1 + S2 — one migration: `supabase/migrations/20260718204224_fix_transaction_tags_idor_and_category_ownership.sql`

**S1 — `get_transaction_tags` IDOR.**
Current definition, `supabase/migrations/20260201164000_baseline_from_schemas.sql:1250-1267` (only definition anywhere — confirmed no later migration overrides it), is `LANGUAGE SQL SECURITY DEFINER` with no ownership check at all:

```sql
CREATE OR REPLACE FUNCTION public.get_transaction_tags (p_transaction_id UUID) RETURNS jsonb LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = '' AS $$
    SELECT COALESCE(
        jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description) ORDER BY t.name)
            FILTER (WHERE t.id IS NOT NULL),
        '[]'::jsonb
    )
    FROM public.transaction_tags tt
    JOIN public.tags t ON tt.tag_id = t.id
    WHERE tt.transaction_id = p_transaction_id;
$$;
```

Fix: `CREATE OR REPLACE` the same function, adding an ownership predicate to the `WHERE` clause (keeps it `LANGUAGE SQL`, no plpgsql conversion needed; matches the "empty array for anything not visible" shape it already has, so callers don't need new error handling):

```sql
WHERE tt.transaction_id = p_transaction_id
  AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = p_transaction_id AND t.user_id = auth.uid()
  );
```

This mirrors the ownership-check idiom already used in the sibling function `set_transaction_tags` (same file, lines 1270-1289).

**S2 — `check_transaction_category_type` doesn't verify category ownership.**
Current definition, same baseline file, lines 506-524:

```sql
CREATE OR REPLACE FUNCTION check_transaction_category_type () RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    IF NEW.type IS DISTINCT FROM (SELECT type FROM public.categories WHERE id = NEW.category_id) THEN
      RAISE EXCEPTION 'Transaction type (%) does not match category type (%)', NEW.type, (SELECT type FROM public.categories WHERE id = NEW.category_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

The parallel trigger `check_transaction_bank_account` (same file, lines 529-547) does this correctly by comparing the referenced row's `user_id` to `NEW.user_id` (not `auth.uid()` — this must work for both the direct-insert and any `SECURITY DEFINER` bulk-insert paths):

```sql
if new.bank_account_id is not null then
  if not exists (
    select 1 from public.bank_accounts b
    where b.id = new.bank_account_id and b.user_id = new.user_id
  ) then
    raise exception 'Bank account does not belong to the user' using errcode = '23514';
  end if;
end if;
```

Fix: `CREATE OR REPLACE FUNCTION public.check_transaction_category_type()` (schema-qualify it while we're touching it — same object, trigger keeps binding since it's the same name/schema, no `DROP TRIGGER` needed) with the ownership check folded in:

```sql
CREATE OR REPLACE FUNCTION public.check_transaction_category_type () RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  v_category_type transaction_type;
  v_category_user_id uuid;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT type, user_id INTO v_category_type, v_category_user_id
    FROM public.categories WHERE id = NEW.category_id;

    IF v_category_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Category does not belong to the user' USING ERRCODE = '23514';
    END IF;

    IF NEW.type IS DISTINCT FROM v_category_type THEN
      RAISE EXCEPTION 'Transaction type (%) does not match category type (%)', NEW.type, v_category_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

**Tests (added alongside the migration, not inside it):**
- `supabase/tests/transaction_tags_test.sql` — already sets up two users (`tx_user1@test.com`/`tx_user2@test.com`) via `tests.create_supabase_user()`/`tests.authenticate_as()`. Add a case: user1 creates a transaction + tag, user2 calls `get_transaction_tags(user1's transaction id)` and must get `'[]'::jsonb` back, not the tags.
- `supabase/tests/transactions_rls_test.sql` — add a case: user2 attempts to INSERT/UPDATE a transaction with `category_id` pointing at one of user1's categories; expect `throws_ok` with SQLSTATE `23514`.

---

### ✅ Done — S4 — `supabase/migrations/20260718205739_transactions_user_id_not_null_cascade.sql`

Current column definition, baseline file lines 130-145:
```sql
user_id UUID REFERENCES auth.users (id),
```
No `NOT NULL`, no `ON DELETE CASCADE` — unlike `categories`, `bank_accounts`, `tags`, `budgets`, `user_settings`, which are all `NOT NULL ... REFERENCES auth.users (id) ON DELETE CASCADE`.

**Before writing the final `DROP CONSTRAINT`,** confirm the actual FK constraint name against the local DB (implicit names can vary):
```sql
select conname from pg_constraint
where conrelid = 'public.transactions'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass;
```
Expected to be the default `transactions_user_id_fkey`; use whatever this returns.

Migration:
```sql
ALTER TABLE public.transactions DROP CONSTRAINT transactions_user_id_fkey; -- use confirmed name
ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
```
`ALTER COLUMN ... SET NOT NULL` will itself fail loudly if any existing row has a NULL `user_id`, so no separate guard is needed — but since this is a real backfilled column (there's a leftover comment at line 461 showing it was bolted onto an existing table), **check the linked/target Supabase project for NULL rows before applying to anything beyond the fresh local dev DB**: `SELECT count(*) FROM public.transactions WHERE user_id IS NULL;`. If any exist, decide (with the user) whether to backfill or hard-delete those rows before this migration runs there — do **not** silently drop rows.

**Test:** add to `supabase/tests/transactions_rls_test.sql` — verify `NOT NULL` is enforced (insert with `user_id = NULL` throws), and verify cascade (create a test user via `tests.create_supabase_user()`, insert a transaction for them, delete the auth user, confirm the transaction row is gone).

---

## Worth-doing items

### ✅ Done — Security headers — `apps/web-next/vercel.json`

Current file (entire contents):
```json
{
  "ignoreCommand": "git diff HEAD^ HEAD --quiet -- ."
}
```
No `headers` key. Add one. The app is a Vite SPA (not Next.js despite the `web-next` directory name) — `index.html` has one external `<script type="module" src="/src/index.tsx">` and no inline scripts/styles, so `script-src 'self'` needs no `'unsafe-inline'`. However, **Ant Design v5's CSS-in-JS (`@ant-design/cssinjs`) injects `<style>` tags at runtime with no nonce**, and `App.tsx` has no `StyleProvider`/nonce config — so `style-src` needs `'unsafe-inline'` unless we also add antd nonce support (a separate frontend change, out of scope here; flag it as a known tradeoff).

The real Supabase project domain isn't in the repo (only injected via Vercel env vars at deploy time) — use a wildcard scoped to Supabase's own domain rather than leaving a placeholder:

```json
{
  "ignoreCommand": "git diff HEAD^ HEAD --quiet -- .",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
      ]
    }
  ]
}
```
After deploying, verify nothing breaks (antd styling, Supabase auth/realtime, images) on both staging and production — a too-strict CSP fails silently in ways that are easy to miss (styling glitches, blocked XHR) rather than loud errors.

### ✅ Done — Soft delete: `deleteMany` hard-deletes — `apps/web-next/src/utility/softDeleteDataProvider.ts`

Current file only overrides `deleteOne` (spreads `...provider` for everything else, including `deleteMany`, which falls through to the base `@refinedev/supabase` provider's hard `.delete()`). Not currently exploited (`deleteMany`/`useDeleteMany` isn't called anywhere in `apps/web-next/src` today — confirmed via grep) but cheap to close now. Add, mirroring the existing `deleteOne` pattern and the base provider's `deleteMany` signature (`{ resource, ids, meta }`):

```ts
deleteMany: async ({ resource, ids, meta }) => {
  if (!SOFT_DELETE_RESOURCES.has(resource)) {
    return provider.deleteMany({ resource, ids, meta });
  }
  const { data, error } = await supabaseClient
    .from(resource)
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
    .select();
  if (error) return Promise.reject(error);
  return { data: data ?? [] };
},
```

### ✅ Done — RPC error sanitization — bulk upload

DB side, `supabase/migrations/20260201164000_baseline_from_schemas.sql`, four spots currently surface raw `SQLERRM` (a live Postgres error string, e.g. constraint names) straight to the client:
- `bulk_insert_transactions` (line 1485) — per-row `'error', SQLERRM` collected into `v_errors`, then raised via `USING DETAIL = v_errors::text` (line 1495-1496)
- `insert_categories` (line 1594), `insert_bank_accounts` (line 1649), `insert_tags` (line 1703) — each: `RAISE EXCEPTION '...failed: %', SQLERRM;`
- `bulk_upload_data` (line 1763), the actual client-facing RPC — same pattern for unexpected ("others") errors; validation errors (`SQLSTATE 'P0001'`) are already re-raised as-is and are fine, since those are intentionally authored user-facing messages, not raw Postgres internals.

Client side, `apps/web-next/src/pages/settings/index.tsx:153-199`, parses `error.details` (the raw `v_errors` JSON) and renders each row's raw message directly in a notification — no sanitization layer exists there or in `apps/web-next/src/utility/rpc.ts:70-75`.

Fix (DB side, new migration `supabase/migrations/20260718000200_sanitize_bulk_upload_errors.sql`): replace raw `SQLERRM` with a SQLSTATE-classified friendly message in all four spots, e.g.:
```sql
'error', CASE SQLSTATE
  WHEN '23505' THEN 'Duplicate entry'
  WHEN '23503' THEN 'Referenced record not found'
  WHEN '23514' THEN 'Value violates a constraint'
  ELSE 'Row could not be inserted'
END,
'sqlstate', SQLSTATE
```
and for the three `RAISE EXCEPTION '...failed: %', SQLERRM` catch-alls, drop the interpolated `SQLERRM` and raise a fixed generic message instead (SQLSTATE is still available to the client via PostgREST's error code field if needed for support/debugging — just not the free-text internals). No client-side change should be needed since it already just displays whatever string comes back.

Also flag as a documentation-debt item (not part of this fix, just noted): `docs/api/bulk-upload.md` describes a different, more structured error shape than what the SQL actually returns — worth reconciling separately.

### ✅ Done — Service role key — process guard, not code

`SUPABASE_SERVICE_ROLE_KEY` is correctly gitignored and un-prefixed (won't be bundled by Vite); used only in `apps/web-next/e2e/utils/test-helpers.ts` for Playwright admin operations. `vercel.json` has no `env`/`build.env` block referencing it today, so there's no active leak — but `docs/deployment/environment-variables.md` currently documents only `SITE_URL` and doesn't mention this key at all. Add a short explicit warning there: this key must never be added as a Vercel project env var (only `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` belong there), since it's a local/CI-only secret for e2e admin operations.

---

## Verification plan

1. **Local Postgres/pgTAP:**
   - `supabase db reset` (reapplies all migrations incl. new ones + seeds)
   - `supabase test db` — run full pgTAP suite, including the new/extended assertions in `transaction_tags_test.sql` and `transactions_rls_test.sql`
   - Manual spot-check: as two different authenticated test users (via the Supabase JS client or `psql` with `SET request.jwt.claims`), confirm `get_transaction_tags` returns `[]` cross-user, and that inserting a transaction with another user's `category_id` throws `23514`
   - For S4: confirm `information_schema`/`pg_constraint` shows `ON DELETE CASCADE` after migration; confirm deleting a test auth user cascades the transaction row
2. **Frontend:**
   - `apps/web-next`: `tsc --noEmit` and lint clean (no behavior change expected from the `deleteMany` addition, but type-check it)
   - Manually trigger a bulk delete (if any UI path exists or via a quick script) to confirm soft-delete still applies, or at minimum confirm via code review that the new `deleteMany` mirrors `deleteOne`'s tested behavior
   - After `vercel.json` header changes are deployed to a preview/staging deployment, check response headers (`curl -I`) and confirm CSP doesn't break antd styling, Supabase auth (login flow), or realtime — this can't be verified from local `vite dev` since Vercel headers only apply on Vercel's edge, so this step is a **post-deploy** check, not local
   - Bulk upload: trigger a deliberate failure (e.g. duplicate row) and confirm the UI shows the new generic message, not raw Postgres text
3. **CI note (out of scope but worth flagging separately):** `.github/workflows/ci.yaml` runs `supabase db lint` but never `supabase test db` — the pgTAP suite (including these new regression tests) isn't gated in CI today. Not fixing this as part of the security plan, but worth knowing the new tests only protect against regressions if run locally/manually unless CI is updated.

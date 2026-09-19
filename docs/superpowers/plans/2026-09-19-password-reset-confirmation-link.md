# Fix password reset emails linking to a 404 — implementation plan

**Date:** 2026-09-19
**Status:** Not started
**Source:** `docs/improvement-roadmap.md` → Known Bugs → "Password reset (and magic-link) emails link to a 404"
**Scope:** Make the "Reset Password" email link work end-to-end (email → set new password → logged in) by switching the recovery template to Supabase's default `{{ .ConfirmationURL }}` flow, and add e2e coverage. Magic-link template gets the same one-line change for consistency (the app has no UI that sends magic links — no `signInWithOtp` in `src/`). Out of scope: building an SPA `/auth/confirm` route (option (a) in the roadmap entry, rejected), PKCE migration, branded auth pages.

## Progress Log

- **2026-09-19** — Step 2 done: added `apps/web-next/e2e/tests/password-reset.spec.ts` (two tests: set a new password from a recovery link then log in with it; a reused link doesn't sign anyone in; both skip on non-local `BASE_URL`). Both fail against local Supabase as expected — Supabase ignores `redirectTo` and lands on `http://127.0.0.1:54321/env(SITE_URL)#access_token=…`, because the local auth container has `GOTRUE_SITE_URL`/`GOTRUE_URI_ALLOW_LIST` set to the literal unresolved string `env(SITE_URL)` (the `SITE_URL` env var isn't set when Supabase starts). So step 3 must also set `SITE_URL`/`site_url` for local, not just extend `additional_redirect_urls`. The route-guard risk (§2.2) is still untested: the test can't reach `/update-password` yet. Next: step 3.
- **2026-09-19** — Pre-flight (step 1) results from the user: **staging** Site URL `https://moneylens-git-main-igor-guliaevs-projects.vercel.app`, Redirect URLs empty, recovery template still uses `/auth/confirm?token_hash=…`, **no custom SMTP**. **Prod** Site URL `https://moneylens-mocha.vercel.app`, Redirect URLs empty, recovery template also still uses `/auth/confirm?token_hash=…` (confirmed by the user), magic-link template not reported for either project. New risk §2.6: with no custom SMTP, Supabase's built-in sender only delivers to project team members and is limited to 2 emails/hour, so real users may not receive reset emails at all, independent of the link bug.
- **2026-09-19** — Decisions recorded: (1) staging allow-lists only the stable `git-main` URL, no Vercel preview wildcard; (2) magic-link template gets the same `{{ .ConfirmationURL }}` change. Consequence noted in §2.3 — the hosted-staging CI e2e can't exercise the redirect on per-deployment preview URLs, so the reset spec is local-only in CI. Pre-flight (step 1) handed to the user. Not started.
- **2026-09-19** — Plan created. Not started. Branch `fix/password-reset-confirmation-link` has the roadmap entry commit only.

---

## 1. Background (verified in code)

- `supabase/templates/recovery.html` links to `{{ .SiteURL }}/auth/confirm?token_hash=…&type=recovery&next=/update-password`. That path was a Next.js route handler (`apps/web/src/app/auth/confirm/route.ts`) deleted in #120. The Vite SPA has no such route and `apps/web-next/vercel.json` has no rewrites, so Vercel returns 404.
- `authProvider.forgotPassword` already sends `redirectTo: ${window.location.origin}/update-password` and `updatePassword` already calls `auth.updateUser({ password })` — both are what Supabase's client-side flow expects, and match Refine's stock Supabase provider. The custom template just ignores `redirectTo`.
- With `{{ .ConfirmationURL }}` the link goes to `<supabase>/auth/v1/verify?token=…&type=recovery&redirect_to=<redirectTo>`; Supabase verifies, then redirects to `redirect_to` with the session in the URL hash; `supabase-js` (`detectSessionInUrl` defaults on; `supabaseClient.ts` doesn't override it) creates the session.

## 2. Risks to resolve first

1. **Allow-list.** `redirect_to` must be in Supabase's Redirect URLs, else Supabase silently falls back to the Site URL and the user never sees the form. `config.toml` has `additional_redirect_urls = ["env(SITE_URL)"]` only. Hosted staging allow-lists only the stable `git-main` URL (see decision under 3); prod needs its exact URL.
2. **Auth-page guard.** `App.tsx` (~L288) wraps `/login`, `/register`, `/forgot-password`, `/update-password` in `<Authenticated fallback={<Outlet/>}><NavigateToResource/></Authenticated>`. A recovery session counts as authenticated, so the user may be redirected off the form before they can type a password. **Unverified** — Refine's own docs example uses the same structure. The e2e test in step 2 is what settles this. If it bounces: move `/update-password` into a route group that allows authenticated users (it needs a session anyway, since `updateUser` requires one).
3. **CI has no Inbucket.** `playwright.yml` runs e2e against hosted staging Supabase + a Vercel preview, so the test can't read an email. Use `supabaseAdmin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } })` — it returns the same `action_link` the email button contains, works against local and hosted, and needs no mail server. (Trade-off: doesn't prove the template renders the link. Cover that with a manual Inbucket check, step 6.)
   **Decision (2026-09-19): allow-list only the stable `git-main` staging URL, no preview wildcard.** `playwright.yml` sets `BASE_URL` to the per-deployment preview URL, which won't be allow-listed, so on hosted staging Supabase would fall back to the Site URL and the reset spec would fail there. Therefore the reset spec runs locally only: `test.skip` when `BASE_URL` isn't a local origin (same pattern as the register test's `test.skip(!!process.env.CI, …)`). Hosted staging is covered by the manual real-email check in step 8.
4. **Hosted templates aren't read from the repo.** The dashboard copy must be updated by hand for staging and prod, after the redirect allow-list is in place. Emails already sent with `/auth/confirm` links stay broken (they were already broken).
5. **One-time link + email scanners.** The `/auth/v1/verify` link is consumed on GET; a pre-fetching scanner can burn it. Accepted trade-off (see roadmap entry); revisit only if users report "link expired".

6. **Built-in SMTP only delivers to team members.** Staging and prod have no custom SMTP. Per Supabase's SMTP docs: "Unless you configure a custom SMTP server for your project, Supabase Auth will refuse to deliver messages to addresses that are not part of the project's team", with "a low rate-limit of 2 messages per hour". The reporter received the email, presumably because their address is on the team. Any other real user would get nothing, so fixing the link alone won't make password reset work for them. Needs a decision: set up custom SMTP (at least for prod) as part of, or right after, this fix. Deliberately not tracked in the roadmap and not implemented in this plan (user's call, 2026-09-19); noted here so the constraint isn't forgotten when rolling out to prod.

## 3. Implementation order

- [ ] 1. **Pre-flight on hosted staging (manual, user).** In the Supabase dashboard, note the current Site URL, Redirect URLs, and recovery template. Confirm Site URL is the staging Vercel URL and that `…/update-password` isn't allow-listed yet.
- [x] 2. **Failing e2e test first** — `apps/web-next/e2e/tests/auth.spec.ts` (or new `password-reset.spec.ts`): `createTestUser` → `generateLink` (recovery, `redirectTo: ${baseURL}/update-password`) → `page.goto(action_link)` → expect URL `/update-password` and the password form visible → fill new password → expect landing on the dashboard → log out, log in with the new password. Also add a negative case: reused/invalid link shows an error and doesn't crash. Run with `npm run test:e2e:ci -- e2e/tests/password-reset.spec.ts`; expect it to fail locally on the allow-list and/or guard. `test.skip` when `BASE_URL` isn't a local origin (see §2.3).
- [ ] 3. **Local config** — `supabase/config.toml`: make `site_url` resolve locally (currently the unresolved literal `env(SITE_URL)`; e.g. hard-code `http://localhost:5173` or document `SITE_URL=http://localhost:5173` before `supabase start`) and extend `additional_redirect_urls` with the local app origin's `/update-password` (Vite dev default is `http://localhost:5173`; the docs say `3000`, which is stale — Playwright's default `BASE_URL` is 5173). Restart Supabase.
- [ ] 4. **Templates** — `supabase/templates/recovery.html` and `magic-link.html`: replace the `href` with `{{ .ConfirmationURL }}`; keep the styling.
- [ ] 5. **Guard fix if step 2 shows a bounce** — move the `/update-password` route out of the `Authenticated`/`NavigateToResource` group in `App.tsx`. Optionally gate the form on a `PASSWORD_RECOVERY` event from `onAuthStateChange`; skip unless step 2 shows a need (YAGNI).
- [ ] 6. **Manual check via Inbucket** (`http://localhost:54324`): request a reset from the UI, confirm the email's button URL is `…/auth/v1/verify?…&redirect_to=…/update-password`, click through, set a password.
- [ ] 7. **Docs** — rewrite the stale parts of `docs/deployment/email-templates-setup.md` (variables `{{ .ConfirmationURL }}`, drop `token_hash`/`/auth/confirm`/`next` expectations), `docs/deployment/redirect-urls-setup.md` (add `…/update-password` entries for local, staging `git-main` and prod), `docs/deployment/password-reset-deployment-checklist.md` (drop "Monitor `/auth/confirm`"), and `docs/deployment/environment-variables.md` (local port 5173).
- [ ] 8. **Roll out to hosted staging** (manual, user): add the stable `git-main` `…/update-password` redirect URL first, then paste the new recovery + magic-link templates; merge PR → staging deploy → run the flow by hand with a real email on the `git-main` URL. (The reset e2e is skipped on preview URLs, so CI doesn't cover this step.)
- [ ] 9. **Roll out to prod** with the next release: same order (allow-list, then template) — do this right before or with the `main` → `release` sync, not after.
- [ ] 10. Tick the roadmap Known Bugs entry to `[x]` with a one-line summary; set this plan's Status to Done.

## 4. Critical files

- `supabase/templates/recovery.html`, `supabase/templates/magic-link.html` — the broken link
- `supabase/config.toml` — `additional_redirect_urls`, `site_url`
- `apps/web-next/src/App.tsx` (~L288–333) — auth route guard around `/update-password`
- `apps/web-next/src/authProvider.ts` (`forgotPassword`, `updatePassword`) — already correct, no change expected
- `apps/web-next/e2e/utils/test-helpers.ts` — `supabaseAdmin`, `createTestUser`, `loginUser`
- `docs/deployment/{email-templates-setup,redirect-urls-setup,password-reset-deployment-checklist,environment-variables}.md`

## 5. Verification plan

1. `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/password-reset.spec.ts` — fails before steps 3–5, passes after.
2. `npm run test:e2e:ci` full suite (auth-related specs especially) — no regressions.
3. `npm run lint && npm run check-types`.
4. Manual Inbucket run (step 6) locally; manual real-email run on staging (step 8) and prod (step 9).

## 6. Decisions and open questions

- **Decided:** stable `git-main` URL only on staging (no preview wildcard); magic-link template updated to `{{ .ConfirmationURL }}`.
- **Open (step 1, user to check in the dashboards):** Site URL and Redirect URLs for staging and prod, and whether the recovery template body still contains `/auth/confirm`. Also worth noting which email sender is configured — Supabase's built-in sender is heavily rate-limited, which can look like "no email arrived" during manual testing.

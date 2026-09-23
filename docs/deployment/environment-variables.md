# Environment Variables

## Required for Production

## Not an environment variable: Site URL

`SITE_URL` looks like it should be a Vercel environment variable, but it isn't one — nothing in
this repo, CI, or Vercel reads a `SITE_URL` env var. It's a **Supabase dashboard setting**
(**Authentication → URL Configuration → Site URL**), configured per Supabase project, used for
generating email links and templates (see `redirect-urls-setup.md`, `email-templates-setup.md`).

- Local: `http://localhost:5173`, hard-coded as `site_url` in `supabase/config.toml` (no env var
  involved locally either)
- Staging: `https://moneylens-git-main-igor-guliaevs-projects.vercel.app/` (set in the staging
  Supabase project's dashboard)
- Production: `https://moneylens-mocha.vercel.app/` (set in the production Supabase project's
  dashboard)


## Optional / Recommended for Production

## Local/CI-Only — Never Set in Vercel

### SUPABASE_SERVICE_ROLE_KEY
- Description: Supabase service role key with elevated (RLS-bypassing) privileges. Used only by Playwright e2e tests (`apps/web-next/e2e/utils/test-helpers.ts`) for admin operations like creating/deleting test users.
- ⚠️ **Never add this as a Vercel project environment variable.** It must stay local/CI-only (e.g. a CI secret injected only for the e2e job). The only Supabase keys that belong in Vercel are `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` — anything prefixed `VITE_` is bundled into the client build, so this key must never be given that prefix or added to a build's env vars.

## Notes & Validation
- Ensure the Supabase dashboard's Site URL is set correctly per environment; email links are
  generated using this value (see "Not an environment variable: Site URL" above).
- Local development needs no env var for this: `supabase/config.toml` sets `site_url` and the
  `/update-password` redirect for `http://localhost:5173`.

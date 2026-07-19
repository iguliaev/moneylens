# Environment Variables

## Required for Production

### SITE_URL
- Description: Base URL of your application, used for email redirects and templates.
- Local: `http://localhost:3000`
- Staging: `https://moneylens-git-main-igor-guliaevs-projects.vercel.app/`
- Production: `https://moneylens-mocha.vercel.app/`
- Used by: Supabase Auth for generating redirect links in magic link and password reset emails.


## Optional / Recommended for Production

## Local/CI-Only — Never Set in Vercel

### SUPABASE_SERVICE_ROLE_KEY
- Description: Supabase service role key with elevated (RLS-bypassing) privileges. Used only by Playwright e2e tests (`apps/web-next/e2e/utils/test-helpers.ts`) for admin operations like creating/deleting test users.
- ⚠️ **Never add this as a Vercel project environment variable.** It must stay local/CI-only (e.g. a CI secret injected only for the e2e job). The only Supabase keys that belong in Vercel are `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` — anything prefixed `VITE_` is bundled into the client build, so this key must never be given that prefix or added to a build's env vars.

## Notes & Validation
- Ensure `SITE_URL` is set correctly in production; email links are generated using this value.
- For local development set `SITE_URL=http://localhost:3000` before starting Supabase so email links point to your dev site.

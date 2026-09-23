# Redirect URLs Setup

## Supabase Dashboard Configuration

1. Go to the Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to: **Authentication** → **URL Configuration** (or similar section for redirect URLs)

## URLs to Add

### Site URL
- Production: `https://moneylens-mocha.vercel.app/`
- Staging: `https://moneylens-git-main-igor-guliaevs-projects.vercel.app/`
- Local development: `http://localhost:5173` (set in `supabase/config.toml`)

### Additional Redirect URLs
- Password reset redirects to `<origin>/update-password` (see `authProvider.forgotPassword`), so each environment needs that exact URL:
  - Production: `https://moneylens-mocha.vercel.app/update-password`
  - Staging: `https://moneylens-git-main-igor-guliaevs-projects.vercel.app/update-password`
  - Local: `http://localhost:5173/update-password` (already in `supabase/config.toml`)
- Only the stable staging `git-main` URL is allow-listed. Per-deployment Vercel preview URLs are not, so password reset can't be completed on a preview deployment (the reset e2e spec skips itself there).
- If a `redirectTo` is not on this list, Supabase silently falls back to the Site URL instead of erroring — the symptom is landing on the dashboard/login instead of the new-password form.


## Why These URLs?
- **Site URL:** Default redirect used by Supabase when generating email links, and the fallback
  destination when a `redirectTo`/`emailRedirectTo` isn't on the allow-list below.
- **Additional Redirect URLs:** the `redirectTo`/`emailRedirectTo` an app call passes (e.g.
  `resetPasswordForEmail`, `signInWithOtp`) is only honored if it's on this list; add every exact
  URL the app can pass.


## Security Note
Only add trusted URLs. A `redirectTo` that isn't on this allow-list doesn't get rejected with an
error — Supabase silently falls back to the Site URL instead, which is why a wrong or missing
entry here shows up as "landed on the dashboard/login instead of the expected page" rather than a
visible failure. Avoid adding wildcard or broad domains unless strictly necessary.


## Quick Steps (Summary)
1. Open Supabase Dashboard → **Authentication** → **URL Configuration**
2. Set the **Site URL** to production/staging/local as appropriate (this is a dashboard setting
   per project, not an environment variable — see `environment-variables.md`)
3. Add the additional redirect URLs used by your app (see the list above)
4. Save and test by generating a recovery email and confirming the link lands on
   `/update-password`, not the dashboard or login page (see `email-templates-setup.md` for the
   full template list and testing steps)

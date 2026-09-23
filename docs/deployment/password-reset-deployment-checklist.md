# Password Reset & Magic Link Deployment Checklist

## Pre-Deployment

### Configuration
- [ ] Supabase dashboard **Site URL** set to the production URL (this is a dashboard setting, not
      a Vercel/CI environment variable — see `environment-variables.md`)
- [ ] All 6 email templates updated in the Supabase dashboard (see `email-templates-setup.md` for
      the full list; configured locally via `config.toml`)
- [ ] Redirect URLs configured in Supabase dashboard, including `<origin>/update-password` (add this **before** updating the templates)
- [ ] Custom SMTP configured (recommended for production deliverability)
- [ ] All tests passing in staging environment

### Code
- [ ] All implementation tasks from the password reset plan completed
- [ ] Code reviewed and approved
- [ ] No debug `console.log` statements in production code
- [ ] Error handling is production-ready and uses `console.error` for server-side logs

### Testing
- [ ] All local tests passing
- [ ] Staging environment tested end-to-end
- [ ] Email deliverability tested (Mailpit/Inbucket for dev, SMTP for staging/prod)
- [ ] Mobile responsiveness verified
- [ ] Accessibility checks completed


## Deployment Steps
- [ ] Deploy backend configuration (update `supabase/config.toml` and templates if self-managed)
- [ ] Restart Supabase services (for self-managed/local): `supabase stop && supabase start`
- [ ] Deploy frontend code (the Vite SPA in `apps/web-next`) to Vercel
- [ ] Verify the Supabase dashboard's Site URL/Redirect URLs and SMTP secrets are set for the
      target environment (not Vercel env vars — see `environment-variables.md`)
- [ ] Smoke test: trigger each of the 6 flows in `email-templates-setup.md` that the app actually
      exposes (signup, password reset; invite/email-change/reauthentication if/when the app UI
      uses them) and confirm emails arrive with working links/codes


## Post-Deployment (First 24 Hours)
- [ ] Monitor Supabase Auth logs for failed `/verify` calls (expired/used recovery tokens)
- [ ] Check email delivery rates and bounce/complaint metrics
- [ ] Monitor user support tickets related to auth emails
- [ ] Track password reset completion rate and magic link success rate
- [ ] Monitor token verification errors and expired-token rates


## Metrics to Track
- Password reset emails sent
- Password reset completion rate
- Magic link emails sent
- Magic link success rate (click → session created)
- Token verification errors (invalid/expired)
- Email delivery failures and bounce rates


## Rollback Plan
If critical issues are discovered during or after deployment:
1. Revert the frontend deployment
2. Revert email template changes in the Supabase dashboard (if updated there)
3. Roll back backend/config changes (e.g. restore previous `config.toml`)
4. Verify the old flow still works, investigate root cause, fix, and redeploy


## Notes
- Use staging to validate all changes before production deployment.
- Hosted Supabase instances don't read `supabase/templates/` — all template changes must also be
  made by hand in that project's dashboard (see `email-templates-setup.md`).
- Ensure the dashboard's Site URL and allowed redirect URLs are configured before sending
  production emails to avoid broken links (see `redirect-urls-setup.md`).
- All link-based templates use `{{ .ConfirmationURL }}` (Supabase-hosted verify link); there is no
  `/auth/confirm` route in the SPA. `reauthentication.html` is the one exception — it's a
  `{{ .Token }}` code, not a link.

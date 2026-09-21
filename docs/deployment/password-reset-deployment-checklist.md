# Password Reset & Magic Link Deployment Checklist

## Pre-Deployment

### Configuration
- [ ] `SITE_URL` environment variable set to the production URL (e.g. `https://moneylens.app`)
- [ ] Email templates updated in Supabase dashboard (or configured via `config.toml`)
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
- [ ] Email deliverability tested (Inbucket for dev, SMTP for staging/prod)
- [ ] Mobile responsiveness verified
- [ ] Accessibility checks completed


## Deployment Steps
- [ ] Deploy backend configuration (update `supabase/config.toml` and templates if self-managed)
- [ ] Restart Supabase services (for self-managed/local): `supabase stop && supabase start`
- [ ] Deploy frontend code (Next.js) to your hosting provider
- [ ] Verify production environment variables (SITE_URL, SMTP secrets) are set
- [ ] Smoke test: Trigger a password reset and a magic link; confirm emails arrive and links work end-to-end


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
- When using a hosted Supabase instance, some template changes must be made in the dashboard rather than config files.
- Ensure `SITE_URL` and allowed redirect URLs are configured before sending production emails to avoid broken links.
- Recovery/magic-link emails use `{{ .ConfirmationURL }}` (Supabase-hosted verify link). There is no `/auth/confirm` route in the SPA.

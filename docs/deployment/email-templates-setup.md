# Email Templates Setup (Hosted Supabase or Self-Managed)

## One-Time Setup (Hosted Supabase)

1. Go to the Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to: **Authentication** → **Email** → **Templates**

### Magic Link Template
- Template name: Magic Link (or create a custom template)
- Subject: `Your Magic Link for MoneyLens`
- Content: copy the contents of `supabase/templates/magic-link.html`. The button's `href` must be `{{ .ConfirmationURL }}`.
- The landing page is the `emailRedirectTo` passed to `signInWithOtp` (it must be in the Redirect URLs allow-list, see `redirect-urls-setup.md`). Nothing in the app sends magic links today.

### Password Recovery Template
- Template name: Reset Password (or create a custom template)
- Subject: `Reset Your Password - MoneyLens`
- Content: copy the contents of `supabase/templates/recovery.html`. The button's `href` must be `{{ .ConfirmationURL }}`.
- `{{ .ConfirmationURL }}` points at Supabase (`<project>/auth/v1/verify?token=…&type=recovery&redirect_to=…`), which verifies the token and redirects to the `redirectTo` the app passed to `resetPasswordForEmail` (`<origin>/update-password`, see `authProvider.forgotPassword`). That URL must be in the Redirect URLs allow-list, otherwise Supabase silently falls back to the Site URL and the user never sees the new-password form.
- Do **not** use `{{ .SiteURL }}/auth/confirm?token_hash=…`: that was the server-side (SSR) flow of the old Next.js app. The Vite SPA has no `/auth/confirm` route, so those links return 404.


## Self-Managed (supabase/config.toml)
If you manage Supabase locally (or with config files), add template entries to `supabase/config.toml`:

```toml
[auth.email.template.magic_link]
subject = "Your Magic Link for MoneyLens"
content_path = "./supabase/templates/magic-link.html"

[auth.email.template.recovery]
subject = "Reset Your Password - MoneyLens"
content_path = "./supabase/templates/recovery.html"
```

The `content_path` should point to the HTML files included in the repository. When Supabase starts with that config, it will use these templates for emails.


## Validation Checklist
- [ ] `supabase/templates/` directory exists and contains `magic-link.html` and `recovery.html`.
- [ ] Both templates use `{{ .ConfirmationURL }}` for the button `href`.
- [ ] `<origin>/update-password` is in the Redirect URLs allow-list for the environment (`redirect-urls-setup.md`).
- [ ] The hosted dashboard copy of each template matches the repo file (hosted projects don't read `supabase/templates/`).
- [ ] After updating templates, restart Supabase: `supabase stop && supabase start` (for local/self-managed).


## Testing
1. Trigger a magic link or password reset in your local dev flow.
2. Open the local mail inbox (Mailpit/Inbucket): `http://localhost:54324` and verify the email content.
3. Confirm the button link is `http://127.0.0.1:54321/auth/v1/verify?token=…&type=recovery&redirect_to=<origin>/update-password`.
4. Click through: you should land on `/update-password` with the new-password form, then be taken to the dashboard after submitting.
5. Automated coverage: `apps/web-next/e2e/tests/password-reset.spec.ts` (builds the same link with `admin.generateLink`; local only).

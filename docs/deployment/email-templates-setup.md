# Email Templates Setup (Hosted Supabase or Self-Managed)

All 6 auth-flow templates Supabase's CLI/self-hosted config supports are customized and stored in
`supabase/templates/`, styled to match the app's design system (`DESIGN.md`,
`apps/web-next/src/theme/tokens.ts`): brand navy/blue/gold palette, `borderRadius: 10` cards and
buttons, and the full logo lockup. There's a 7th, "Reauthentication", section in the Supabase
dashboard's **Templates** tab that some accounts also show under a separate "Security
Notifications" area (e.g. "Password Changed") — those notification templates aren't
`content_path`-configurable via `config.toml` (no corresponding CLI setting exists), so they're
out of scope here; check your dashboard and treat any such template as dashboard-only.

| File | Dashboard template name | `config.toml` section | Variables it uses |
|---|---|---|---|
| `confirm-your-signup.html` | Confirm signup | `[auth.email.template.confirmation]` | `ConfirmationURL` |
| `invite-user.html` | Invite user | `[auth.email.template.invite]` | `ConfirmationURL` |
| `magic-link.html` | Magic Link | `[auth.email.template.magic_link]` | `ConfirmationURL` |
| `change-email-address.html` | Change Email Address | `[auth.email.template.email_change]` | `ConfirmationURL`, `Email`, `NewEmail` |
| `reset-password.html` | Reset Password | `[auth.email.template.recovery]` | `ConfirmationURL` |
| `reauthentication.html` | Reauthentication | `[auth.email.template.reauthentication]` | `Token` (a 6-digit code — no link; `ConfirmationURL`/`TokenHash` aren't generated for this flow) |

File names match the dashboard's template names (not the `config.toml` section name, which is
fixed by GoTrue/the CLI and doesn't always match — e.g. "Reset Password" is the `recovery`
section). This mapping is also documented as a comment above the `[auth.email.template.*]` block
in `config.toml`.

## Shared design

Every template shares one HTML skeleton (see any file in `supabase/templates/` for the exact
markup): a centered `max-width: 480px` table, the brand logo, a white card
(`border-radius: 10px`, 1px `#e5e7eb` border) with a heading, body copy, a call-to-action, and a
footnote, then a small "MoneyLens · TRACK. BUDGET. UNDERSTAND." footer. Colors come straight from
`theme/tokens.ts`'s light-mode palette (`#1F2A37` text, `#6B7280` secondary text, `#185FA5`
primary/button, `#F7F9FC` page background). `reauthentication.html` swaps the button for a
monospace OTP code chip, since that flow has no link to click.

Email clients don't reliably support custom `@font-face` fonts or dark-mode-aware images, so
these templates are **light-mode only** and use a system font stack
(`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`) rather
than the app's self-hosted Inter — that's a deliberate scope cut, not an oversight.

### The logo

The header image is `apps/web-next/public/email-logo.png` (copied from
`brand-assets/logo/logo-light.png`, the full lockup + tagline, light-background variant — the
dark-background variant renders "Money" nearly invisible on a white email body, so don't swap it
in). It's referenced as `{{ .SiteURL }}/email-logo.png`, so it resolves to whichever environment's
Site URL sent the email, with no per-environment hardcoding. `SiteURL` is populated for every
Supabase mail type, including `reauthentication` (confirmed against GoTrue's source — its
`EmailData` struct puts `SiteURL` at the top level, not per-flow), so this is safe everywhere.
If the logo needs updating, replace both `brand-assets/logo/logo-light.png` and the `public/` copy
together.

## One-Time Setup (Hosted Supabase)

1. Go to the Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to: **Authentication** → **Emails** → **Templates**
4. For each row in the table above: open that template, set the **Subject** (see
   `config.toml`, below, for the exact subject text per template), and paste the contents of the
   matching file from `supabase/templates/` into the **Message body**.
5. Repeat for every environment (staging, production) — hosted projects don't read
   `supabase/templates/`, so this is manual, per-project work every time a template changes.

## Self-Managed (supabase/config.toml)

Already wired in this repo's `supabase/config.toml`:

```toml
[auth.email.template.invite]
subject = "You're Invited to MoneyLens"
content_path = "./supabase/templates/invite-user.html"

[auth.email.template.confirmation]
subject = "Confirm Your Email - MoneyLens"
content_path = "./supabase/templates/confirm-your-signup.html"

[auth.email.template.magic_link]
subject = "Your Magic Link for MoneyLens"
content_path = "./supabase/templates/magic-link.html"

[auth.email.template.recovery]
subject = "Reset Your Password - MoneyLens"
content_path = "./supabase/templates/reset-password.html"

[auth.email.template.email_change]
subject = "Confirm Your New Email - MoneyLens"
content_path = "./supabase/templates/change-email-address.html"

[auth.email.template.reauthentication]
subject = "{{ .Token }} is your MoneyLens verification code"
content_path = "./supabase/templates/reauthentication.html"
```

The `content_path` should point to the HTML files included in the repository. When Supabase
starts with that config, it will use these templates for emails.

## Redirect / SiteURL notes

- `{{ .ConfirmationURL }}` points at Supabase (`<project>/auth/v1/verify?token=…&type=…&redirect_to=…`),
  which verifies the token and redirects to whatever `redirectTo`/`emailRedirectTo` the app passed
  when it triggered the flow (e.g. `resetPasswordForEmail`'s `redirectTo: <origin>/update-password`
  — see `authProvider.forgotPassword`). That URL must be in the Redirect URLs allow-list
  (`redirect-urls-setup.md`), otherwise Supabase silently falls back to the Site URL and the user
  never lands on the intended page.
- Do **not** use `{{ .SiteURL }}/auth/confirm?token_hash=…`: that was the server-side (SSR) flow of
  the old Next.js app. The Vite SPA has no `/auth/confirm` route, so those links 404.
- `reauthentication.html` has no `ConfirmationURL`/redirect at all — it's a code the user types
  back into the app, not a link, so the Redirect URLs allow-list doesn't apply to it.

## Validation Checklist

- [ ] `supabase/templates/` contains all 6 files listed in the table above.
- [ ] Every template except `reauthentication.html` uses `{{ .ConfirmationURL }}` for its button
      `href`.
- [ ] `<origin>/update-password` (and any other `redirectTo`/`emailRedirectTo` destination the app
      uses) is in the Redirect URLs allow-list for the environment (`redirect-urls-setup.md`).
- [ ] The hosted dashboard copy of each template (subject **and** body) matches the repo file, for
      every environment — hosted projects don't read `supabase/templates/`.
- [ ] `apps/web-next/public/email-logo.png` exists and matches `brand-assets/logo/logo-light.png`.
- [ ] After updating templates locally, restart Supabase: `supabase stop && supabase start`.

## Testing

1. Trigger the flow in your local dev app (or via the Supabase Admin API, e.g.
   `supabaseAdmin.auth.admin.inviteUserByEmail(...)`, `.generateLink(...)`, or
   `auth.reauthenticate()` on a signed-in session for flows the UI doesn't expose).
2. Open the local mail inbox (Mailpit/Inbucket): `http://localhost:54324` and verify the email
   content — check the subject, that the logo image loads (points at
   `http://localhost:5173/email-logo.png` locally), and that no `{{ ... }}` placeholder is left
   unrendered in the body.
3. For link-based flows, confirm the button links to
   `http://127.0.0.1:54321/auth/v1/verify?token=…&type=<flow>&redirect_to=…`.
4. Click through (link flows) or copy the code back into the app (reauthentication) and confirm
   the flow completes.
5. Automated coverage: `apps/web-next/e2e/tests/password-reset.spec.ts` covers the recovery flow
   end-to-end (builds the same link with `admin.generateLink`; local only). The other 5 templates
   don't have e2e coverage — verify them manually per the steps above when changed.

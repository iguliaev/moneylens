# Custom SMTP Setup (Gmail)

## Why this exists

Supabase's built-in email sender (no custom SMTP configured) has two hard limits, both
undocumented until you hit them:

1. It **refuses to deliver to any address that isn't on the Supabase project's team** — a real
   signup/reset/invite to any other address silently goes nowhere.
2. It's capped at **2 emails/hour**.

Both were discovered while debugging the password reset flow (see
`docs/superpowers/plans/2026-09-19-password-reset-confirmation-link.md` §2.6) — the bug reporter
received the test email only because their address was on the project team; any other user would
have gotten nothing, independent of the link/template bug that plan fixed. Custom SMTP removes
both restrictions and raises the send cap to 30/hour by default (adjustable in the dashboard).

## What's configured

**Account:** `moneylens.noreply@gmail.com` — a dedicated Gmail account created solely to relay
these emails, not anyone's personal inbox. It has 2-Step Verification enabled (required before
Google will issue an app password) and one app password, labeled **"Supabase SMTP"** in that
account's App Passwords list, used as the SMTP password below.

**Where it's wired in:** the Supabase dashboard's SMTP settings, **per project** — staging and
prod each have their own copy of this configuration. It is **not** in this repo, and not a Vercel
environment variable. See "Why not `config.toml`" below for why that's deliberate.

| Field | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `moneylens.noreply@gmail.com` |
| Password | the account's app password (see "Rotating/revoking" below — never committed anywhere) |
| Sender name | `MoneyLens` |
| Sender email | `moneylens.noreply@gmail.com` |

Configured in: **Supabase Dashboard → [project] → Authentication → Emails → SMTP Settings**.

## Why not `supabase/config.toml`

`config.toml`'s `[auth.email.smtp]` section exists and could technically hold this, but it's
deliberately left unconfigured (commented out) for two reasons:

1. **Hosted Supabase (staging/prod) doesn't read `config.toml` at all.** It only drives the local
   CLI stack (`supabase start`). CI never runs `supabase config push` (checked: `deploy-staging.yaml`,
   `deploy-production.yaml`, `playwright.yml` only run `supabase link && supabase db push`), so
   there's no path by which a `config.toml` SMTP block would ever reach the hosted projects anyway.
2. **Enabling it locally would break local dev and the e2e suite.** Local Supabase currently routes
   every auth email to Mailpit (`[inbucket] enabled = true`), the fake local inbox at
   `http://localhost:54324` that `email-templates-setup.md`'s manual testing steps and
   `apps/web-next/e2e/tests/password-reset.spec.ts` both rely on being able to inspect. Turning on
   `[auth.email.smtp]` locally would route real sends through Gmail *instead of* Mailpit — needing
   internet access for every local test run, burning through Gmail's send caps during normal
   iteration, and losing the ability to just look at `localhost:54324` to see what was sent. It
   would also silently activate `config.toml`'s `[auth.rate_limit] email_sent = 2` line, whose own
   comment says it "requires `auth.email.smtp` to be enabled" — throttling local dev to 2 emails/hour
   for no benefit.

So: **local dev intentionally keeps using Mailpit, unchanged.** Only the two hosted projects use
real SMTP.

## Setting this up again from scratch (e.g. rotating to a new account)

1. Create (or reuse) a Gmail account for sending. Naming convention: `<something>.noreply@gmail.com`
   — signals to recipients not to reply, matches how this one was named.
2. Turn on 2-Step Verification: `myaccount.google.com/security`. Needs a phone number on the
   account; Google will verify it (text or prompt).
3. Generate an app password: `myaccount.google.com/apppasswords`. This page is **hidden** until
   step 2 is done — if Google says app passwords "aren't available for your account," 2SV is
   almost certainly still off (the other possible causes are: 2SV set up with a security key only
   and no other method, a Google Workspace/org account with the feature disabled by policy, or
   Advanced Protection Program enabled — see
   [Google's help page](https://support.google.com/accounts/answer/185833)).
4. The app name field on that page is just a label for your own reference (e.g. "Supabase SMTP")
   — it has no effect on the password's function or scope.
5. Google displays the generated password as 4 groups of 4 characters
   (`aaaa bbbb cccc dddd`) purely for readability. **The spaces aren't part of the password** —
   enter it as one continuous 16-character string wherever it's used.
6. In each Supabase project's dashboard (staging, then prod), go to **Authentication → Emails →
   SMTP Settings** and fill in the table above with the new account's address and password.
7. Test on staging first: trigger a real password reset (or any of the 6 flows in
   `email-templates-setup.md`) to a real inbox and confirm delivery, before touching prod.
8. Optional: check **Authentication → Rate Limits** in the dashboard — custom SMTP raises the
   default send cap to 30/hour; adjust if MoneyLens's volume ever needs more.

## Rotating or revoking the app password

App passwords can be individually revoked without affecting the Gmail account's login password:
`myaccount.google.com/apppasswords` → find the "Supabase SMTP" entry → revoke. Generate a new one
and update it in both the staging and prod Supabase dashboards (they're independent — revoking or
rotating doesn't propagate automatically between them, or from Google to Supabase).

## Known limitations of this setup

- **Not a transactional email provider.** Supabase's own SMTP docs recommend Resend, AWS SES,
  Postmark, SendGrid, ZeptoMail, or Brevo for production — Gmail isn't on that list. This was
  chosen as a low-cost fix proportionate to a personal project's volume, not a scalability
  decision.
- **Gmail's own sending caps still apply** underneath whatever Supabase's rate limit is set to: a
  personal Gmail account is capped around 500 messages/day (a Workspace account, ~2,000/day).
- **No custom sending domain.** The sender is `moneylens.noreply@gmail.com` itself, not e.g.
  `noreply@moneylens.app`. Using a custom domain through Gmail's relay would need that domain
  added as a verified "Send As" alias on this Gmail account (Gmail Settings → Accounts → Send mail
  as) with its own SPF/DKIM records — without that, mail sent "as" a domain you don't own on
  Google's system typically gets tagged "via gmail.com" in recipients' inboxes, which is why the
  Gmail address is used directly instead.
- **If this app ever needs real scale**, migrate to one of Supabase's recommended providers rather
  than pushing this setup further — see the guidance link above.

# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## ⚠️ Git Workflow — CRITICAL RULES

- **NEVER commit directly to `main` or `release` branches.** Always create a feature branch for any code changes.
- Only commit to `main` or `release` if the user explicitly instructs you to do so in that message.
- Default workflow: create a branch → commit → open a PR.
- **When opening a PR, use the `create-pull-request` skill** rather than running `git push` + `gh pr create` manually — invoke it whenever the user asks to create/open/submit a PR, ship, or send changes for review.

## Repository Structure

```
moneylens/
├── apps/
│   └── web-next/         # Main Vite + Refine frontend application
├── supabase/             # Database layer
│   ├── migrations/       # Timestamped SQL migration files
│   ├── seeds/            # Sample data for development
│   ├── templates/        # Email templates
│   ├── tests/            # Database tests (pgTAP)
│   └── config.toml       # Supabase CLI configuration
├── docs/                 # Documentation files
├── scripts/              # Utility scripts
├── utils/                # Helper utilities
└── types.gen.ts          # Auto-generated TypeScript types from Supabase
```

## Preferred Languages & Technologies

### Frontend (apps/web-next)
- **Language**: TypeScript
- **Framework**: Vite + React 19 with Refine framework
- **UI Library**: Ant Design 5
- **State/Data**: Refine hooks + Supabase client
- **Testing**: Playwright for E2E tests

### Backend
- **Database**: PostgreSQL 17 via Supabase
- **Auth**: Supabase Auth
- **APIs**: Auto-generated REST/GraphQL via Supabase
- **Edge Functions**: Deno (if needed)

## Web App Commands

### Development

```bash
cd apps/web-next

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

### Code Quality

```bash
cd apps/web-next

# Lint code
npm run lint

# Type check
npm run check-types
```

### E2E Testing

```bash
cd apps/web-next

# Run all tests (agent-friendly: text output, no browser window)
npm run test:e2e:ci

# Run all tests (manual: opens HTML report in browser on failure)
npm run test:e2e

# Run with UI (interactive test runner)
npm run test:e2e:ui

# Run with browser visible
npm run test:e2e:headed

# Run specific test file (agent-friendly)
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts

# Run specific test by name (agent-friendly)
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "user can add tags"

```

## Database Schema & Migrations

⚠️ **Every schema change MUST go through a migration file.** Never modify a migration that has already merged to `main` — always create a new one instead (`supabase migration new <name>`). Full workflow, Supabase CLI commands, conventions, and local ports: [`docs/database/schema-and-migrations.md`](docs/database/schema-and-migrations.md)

## Documentation

Check these before starting work in the relevant area — don't guess at conventions that are already written down.

| Doc | When to read it |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md) | Local setup, prerequisites, common commands |
| [`docs/domain/overview.md`](docs/domain/overview.md) | What MoneyLens is, and before working on transactions, categories, budgets, or tags — links to a concept doc for each |
| [`docs/database/schema-and-migrations.md`](docs/database/schema-and-migrations.md) | Any schema/migration change, RLS, `SECURITY DEFINER` rules |
| [`docs/api/bulk-upload.md`](docs/api/bulk-upload.md) | Working on the `bulk_upload_data` RPC / bulk import |
| [`docs/deployment/release-howto.md`](docs/deployment/release-howto.md) | Cutting a release, syncing `main` → `release` |
| [`docs/deployment/environment-variables.md`](docs/deployment/environment-variables.md) | Env vars, secrets, Vercel config |
| [`docs/deployment/email-templates-setup.md`](docs/deployment/email-templates-setup.md) | Auth email templates (Supabase hosted or self-managed) |
| [`docs/deployment/redirect-urls-setup.md`](docs/deployment/redirect-urls-setup.md) | Auth redirect URL configuration |
| [`docs/deployment/password-reset-deployment-checklist.md`](docs/deployment/password-reset-deployment-checklist.md) | Password reset / magic link flow changes |
| [`docs/improvement-roadmap.md`](docs/improvement-roadmap.md) | Picking up the next planned improvement |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) & [`specs/`](docs/superpowers/specs/) | Historical plan/spec docs for past features — background context, not current state |

## Environment Configuration

- Local development: `apps/web-next/.env.local`
- Supabase config: `supabase/config.toml`
- Environment backups: `.env.backup.*` files at repo root

## Deployment

- **Staging**: Merges to `main` trigger staging deployment
- **Production**: Sync `release` branch with `main` for production deployment

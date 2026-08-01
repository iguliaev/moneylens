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

## Environment Configuration

- Local development: `apps/web-next/.env.local`
- Supabase config: `supabase/config.toml`
- Environment backups: `.env.backup.*` files at repo root

## Deployment

- **Staging**: Merges to `main` trigger staging deployment
- **Production**: Sync `release` branch with `main` for production deployment

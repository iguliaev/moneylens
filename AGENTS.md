# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

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

# Run tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run with browser visible
npm run test:e2e:headed
```

## Supabase Database Management

### Essential Commands

```bash
# Start local Supabase stack (PostgreSQL, Auth, Studio, etc.)
supabase start

# Stop Supabase services
supabase stop

# Open Supabase Studio (web UI for database management)
supabase studio
```

### Migration Workflow

```bash
# Create a new migration file
supabase migration new <descriptive_name>

# Apply pending migrations to local database
supabase migration up

# Reset database (drops all data and re-applies migrations + seeds)
supabase db reset

# View migration status
supabase migration list

# Generate diff between local and remote schema
supabase db diff
```

### Database Testing

```bash
# Run pgTAP database tests
supabase test db
```

### Type Generation

```bash
# Generate TypeScript types from database schema
supabase gen types typescript --local > types.gen.ts
```

### Remote Database Operations

```bash
# Link to remote Supabase project
supabase link --project-ref <project-ref>

# Push migrations to remote
supabase db push --linked

# Pull remote schema changes
supabase db pull
```

## Database Schema Guidelines

### Creating Migrations

1. Create migration: `supabase migration new my_feature`
2. Edit the generated SQL file in `supabase/migrations/`
3. Apply locally: `supabase dmigration up`
4. Test with: `supabase test db`
5. Update seeds if needed in `supabase/seeds/`

### Conventions

- **Table/Column Naming**: Use `snake_case`
- **Function Security**: Default to `SECURITY INVOKER` with explicit `search_path = ''`
- **User Data Isolation**: Always scope queries to `auth.uid()`
- **RLS Policies**: Enable Row Level Security on all user-facing tables

### Key Tables

- `transactions`: Financial activity (earnings, spendings, savings)
- `categories`: User-defined transaction categories
- `bank_accounts`: User-defined bank accounts
- `tags`: User-defined tags for transactions

## Local Development Ports

| Service          | Port  |
|------------------|-------|
| API              | 54321 |
| Database         | 54322 |
| Supabase Studio  | 54323 |
| Inbucket (Email) | 54324 |
| Analytics        | 54327 |

## Environment Configuration

- Local development: `apps/web-next/.env.local`
- Supabase config: `supabase/config.toml`
- Environment backups: `.env.backup.*` files at repo root

## Deployment

- **Staging**: Merges to `main` trigger staging deployment
- **Production**: Sync `release` branch with `main` for production deployment

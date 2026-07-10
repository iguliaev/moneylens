# Getting Started

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Node.js](https://nodejs.org/) for the frontend app and tooling
- [Deno](https://deno.com/) if you use edge functions

## Local Setup

```sh
supabase start
cd apps/web-next
npm install
```

## Common Commands

```sh
# Apply database changes
supabase db push

# Reset local database
supabase db reset

# Start the frontend app
cd apps/web-next
npm run dev
```

## Frontend Notes

- The web app lives in `apps/web-next/`.
- `npm run test:e2e` starts Playwright with the local dev server when `BASE_URL` is not set.
- `npm run test:e2e:ci` is the CI-friendly test command.

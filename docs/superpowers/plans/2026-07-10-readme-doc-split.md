# README Docs Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the root README into a short entry point, move setup guidance into `docs/getting-started.md`, and remove the stale RPC section from the top-level docs.

**Architecture:** Keep the root `README.md` as a lightweight index with links to the canonical docs. Put onboarding material in a dedicated getting-started doc and leave deployment material under `docs/deployment/`. Preserve existing content where possible, but relocate it so each document has one clear purpose.

**Tech Stack:** Markdown documentation, repository navigation links, Git.

---

### Task 1: Add the getting-started document

**Files:**
- Create: `docs/getting-started.md`
- Reference: `README.md`
- Reference: `apps/web-next/README.MD`

- [ ] **Step 1: Write the new getting-started document**

```md
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
```

- [ ] **Step 2: Verify the new file exists and has the expected headings**

Run:

```bash
sed -n '1,80p' docs/getting-started.md
```

Expected: the file starts with `# Getting Started` and includes Prerequisites, Local Setup, and Common Commands sections.

- [ ] **Step 3: Commit the new doc**

```bash
git add docs/getting-started.md
git commit -m "docs: add getting started guide"
```

### Task 2: Trim the root README into a navigation page

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove the stale RPC section and move the overview into a short index**

Replace the root README body with a concise entry point like this:

```md
# MoneyLens

MoneyLens is a personal finance app for tracking transactions, budgets, and insights.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Deployment Docs](docs/deployment/release-howto.md)
- [Web App README](apps/web-next/README.MD)
- [API Docs](docs/api/bulk-upload.md)

## Project Structure

- `apps/web-next/` — Vite + React frontend
- `supabase/` — database schema, migrations, and tests
- `docs/` — deployment, API, and project documentation
```

Remove the entire RPC section that currently begins at `### RPC Functions` and ends at the end of the `bulk_insert_transactions` description.

- [ ] **Step 2: Check the README for leftover stale content**

Run:

```bash
rg -n "RPC Functions|bulk_insert_transactions|coming soon|Refine\\] \\(coming soon\\)" README.md
```

Expected: no matches.

- [ ] **Step 3: Commit the README rewrite**

```bash
git add README.md
git commit -m "docs: simplify root README"
```

### Task 3: Update the web-next README to point at the new docs

**Files:**
- Modify: `apps/web-next/README.MD`

- [ ] **Step 1: Update the onboarding links and references**

Keep the current app-specific guidance, but add a clear pointer to the new getting-started doc:

```md
## Getting Started

- Read the repository guide: [docs/getting-started.md](../../docs/getting-started.md)
- Playwright auto-starts the dev server via `webServer` when `BASE_URL` is not set.
- Use `npm run test:e2e:ci` for CI-friendly terminal output.
- CI uses 2 Playwright workers by default in `playwright.config.ts`.
```

- [ ] **Step 2: Verify the README mentions the CI test command**

Run:

```bash
rg -n "test:e2e:ci|docs/getting-started.md|2 workers" apps/web-next/README.MD
```

Expected: all three references are present.

- [ ] **Step 3: Commit the app README update**

```bash
git add apps/web-next/README.MD
git commit -m "docs: link web-next README to getting started guide"
```

### Task 4: Final link check and cleanup

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `apps/web-next/README.MD`
- Modify if needed: `docs/getting-started.md`

- [ ] **Step 1: Verify the doc graph is consistent**

Run:

```bash
rg -n "docs/getting-started.md|docs/deployment/release-howto.md|docs/api/bulk-upload.md|apps/web-next/README.MD" README.md apps/web-next/README.MD docs/getting-started.md
```

Expected: the root README links out to the new docs, and the app README points back to the getting-started guide.

- [ ] **Step 2: Review the rendered markdown for obvious breakage**

Run:

```bash
git diff -- README.md apps/web-next/README.MD docs/getting-started.md
```

Expected: headings, links, and code fences render cleanly with no duplicated onboarding content.

- [ ] **Step 3: Commit any final cleanup**

```bash
git add README.md apps/web-next/README.MD docs/getting-started.md
git commit -m "docs: finalize README split"
```

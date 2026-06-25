# Release Process Simplification Design

> **Goal:** Simplify and automate staging + production deployments so `main` continuously delivers staging, while production is deployed only from explicitly tagged versions.

**Architecture:** Keep a two-branch model (`main` for staging, `release` for production gate). Move production deployment control to a phased GitHub Actions release workflow that creates a release PR, then publishes only when a `vX.Y.Z` tag is approved. Keep a thin local CLI wrapper that dispatches workflow phases for convenience.

**Tech Stack:** GitHub Actions, `gh` CLI, Bash, Supabase CLI, Vercel CLI/API.

---

## Decision: Keep both `main` and `release` branches

### Recommendation
Keep both branches.

### Why this is more reliable than main-only for this repository
- You currently use one Vercel project where `release` is the production branch and `main` is preview/staging.
- Supabase already has separate staging and production projects, with migration workflows tied to `main` and `release`.
- A main-only model would collapse the safety boundary between staging and production and increase accidental-prod risk.
- Keeping `release` preserves an explicit production gate and aligns with emergency hotfix flow.

---

## Target operating model

### Staging (continuous)
- Any merge to `main`:
  - deploys Supabase migrations to staging (existing behavior)
  - deploys frontend preview/staging from `main` (existing Vercel behavior)

### Production (tag-gated)
- Production changes are prepared by PR `main -> release`.
- Production deployment is executed only during publish phase with a validated semver tag (`vX.Y.Z`).
- Release metadata/changelog is created in GitHub Releases for the same tag.

### Hotfix (emergency bypass allowed)
- Branch from `release` to `hotfix/<name>`.
- PR `hotfix/<name> -> release`.
- Publish with hotfix tag (normal release publish phase).
- Backport via PR `release -> main`.

---

## Workflow design

### 1) Release Orchestrator Workflow (`workflow_dispatch`)

Create `.github/workflows/release.yml` with required inputs:
- `phase`: `prepare | publish | sync`
- `tag`: `vX.Y.Z`

### `prepare` phase
- Validate tag format.
- Fetch and print commits in `release..main`.
- Stop with clear message if no commits to release.
- Create PR `main -> release` with title `release: <tag>`.
- Output release PR URL.

### `publish` phase
- Assert release PR is merged (or assert `release` contains expected commit).
- Verify tag does not already exist.
- Create and push tag on `release` HEAD.
- Create GitHub Release with generated notes.
- Trigger production deployments for:
  - Supabase production migrations
  - Vercel production deployment from the tagged commit
- Output GitHub Release URL and production deployment URLs.

### `sync` phase
- Optional PR `release -> main` to sync merge commit(s).
- Merge with regular merge commit.
- Output sync PR URL.

### 2) Deploy workflows alignment

### Supabase
- Keep staging deploy on `push` to `main` (`deploy-staging.yaml`).
- Change production deploy to tag trigger:
  - `on.push.tags: ['v*.*.*']`
  - production job reads tag commit and deploys migrations to production project.

### Vercel
- Keep `main` preview behavior as-is.
- For production, do not rely on automatic branch push timing.
- In `publish` phase, deploy explicitly from the tagged commit via Vercel CLI/API (`--prod`) and wait for success.

This gives semver-tag-controlled production while preserving current one-project Vercel setup.

---

## Thin local wrapper

Create `scripts/release.sh` as a convenience entrypoint:
- `release.sh prepare v1.2.3`
- `release.sh publish v1.2.3`
- `release.sh sync v1.2.3`

Responsibilities:
- validate arguments
- call `gh workflow run release.yml -f phase=... -f tag=...`
- print run URL for follow-up

Non-goal:
- no duplicate orchestration logic locally

---

## Reliability controls

- Branch protection:
  - no direct pushes to `release`
  - required checks on release PR
- Environment protection:
  - require reviewer gate for production environment jobs
- Concurrency:
  - one release publish at a time (`concurrency: production-release`)
- Idempotency:
  - fail if tag already exists
  - fail if phase preconditions are not met
- Observability:
  - each phase prints summary + URLs
  - artifacts/logs retained in Actions history

---

## Rollback and failure handling

- Primary rollback: redeploy previous stable tag for frontend + database-compatible rollback path.
- If publish fails after tag creation:
  - mark release as failed in workflow output
  - open follow-up hotfix flow from `release`.
- If sync fails:
  - production remains valid; sync can be re-run independently.

---

## Migration plan from current process

1. Add new `release.yml` workflow with phased dispatch.
2. Update production Supabase deploy trigger from `release` branch push to semver tag push.
3. Add explicit Vercel production deploy step in `publish`.
4. Add `scripts/release.sh` wrapper.
5. Update `.github/workflows/README.md` with the new release runbook.
6. Dry-run in staging-like scenario, then run first real release with manual supervision.

---

## Testing strategy

- Unit-like shell checks:
  - tag regex validation
  - phase argument validation
- Workflow validation:
  - dispatch `prepare` with invalid tag -> hard fail
  - dispatch `prepare` with no diff -> clear stop
  - dispatch `prepare` with pending commits -> PR created
- End-to-end release rehearsal:
  - run `prepare`, merge PR, run `publish`, verify:
    - Git tag exists
    - GitHub Release exists
    - Supabase production migration workflow succeeds
    - Vercel production deployment succeeds
- Hotfix rehearsal:
  - `hotfix/* -> release` + `publish` + backport sync.

---

## Scope boundaries

In scope:
- release process simplification and automation
- semver-tag-gated production publish
- staged/manual gates where needed

Out of scope:
- replacing Vercel with a separate frontend deployment platform
- removing `release` branch
- full GitOps redesign of all environments

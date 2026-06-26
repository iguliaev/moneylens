# Release Automation Design

**Date:** 2026-06-26  
**Status:** Approved for planning  
**Scope:** Automate release preparation, post-merge tagging/release creation, and optional branch sync.

## 1. Goals

1. Replace manual release prep with a manually-triggered GitHub Action that creates/updates a `main -> release` PR.
2. Automatically create a tag and GitHub Release after a valid release PR is merged into `release`.
3. Provide a separate manually-triggered workflow to create/update a `release -> main` sync PR.

## 2. Non-Goals

1. Auto-merging release or sync PRs.
2. Fully automatic version bumping (v1 requires explicit version input).
3. Changing existing deployment workflows for staging/production environments.

## 3. Workflow Architecture

### 3.1 `prepare-release.yml` (manual)

Trigger: `workflow_dispatch` with required `version` input (`vX.Y.Z`).

Responsibilities:

1. Validate semver format and fail fast on invalid input.
2. Ensure the provided tag does not already exist.
3. Determine previous tag for changelog range.
4. Generate release notes via GitHub Release Notes API for `previous_tag -> main`.
5. Create or update a single open PR from `main` to `release`:
   - Title: `release: <version>`
   - Body: generated changelog + release metadata.

### 3.2 `finalize-release.yml` (automatic on PR merge)

Trigger: `pull_request` (`types: [closed]`) with base branch `release`.

Run condition:

1. PR is merged.
2. PR title matches `release: vX.Y.Z`.

Responsibilities:

1. Parse version from PR title.
2. Verify tag does not already exist.
3. Create and push annotated tag on the PR `merge_commit_sha`.
4. Create GitHub Release for that tag targeting `release` with generated notes.

### 3.3 `sync-release-main.yml` (manual)

Trigger: `workflow_dispatch`.

Responsibilities:

1. Create or update a `release -> main` PR.
2. Use deterministic title/body to avoid duplicate PRs.
3. Never auto-merge.

## 4. Data Flow

### 4.1 Prepare Release

1. User dispatches workflow with `version`.
2. Workflow validates input and branch/tag state.
3. Workflow computes changelog source range.
4. Workflow calls GitHub API to generate notes.
5. Workflow creates/updates release PR.

### 4.2 Finalize Release

1. Release PR is merged into `release`.
2. Workflow inspects PR context and extracts version.
3. Workflow tags merge commit.
4. Workflow creates GitHub Release entry.

### 4.3 Sync Back

1. User dispatches sync workflow.
2. Workflow creates or updates sync PR.
3. User reviews and merges manually.

## 5. Safety and Error Handling

1. Hard-fail on:
   - Invalid version format.
   - Existing tag conflict.
   - Missing/invalid merge context.
   - GitHub API failures.
2. Restrict auto-tagging to merged PRs with title pattern `release: vX.Y.Z` to avoid accidental tagging of unrelated PRs.
3. Use idempotent checks so repeated runs update existing PRs and do not duplicate tags/releases.
4. Apply least-privilege workflow permissions (`contents`, `pull-requests` only as needed).

## 6. Authentication Strategy

1. Primary: `GITHUB_TOKEN`.
2. Fallback: optional fine-grained PAT secret only if branch protection or permission model blocks required operations.

## 7. Concurrency and Idempotency

1. Add workflow-level concurrency groups to prevent conflicting simultaneous runs.
2. Reuse existing open PRs for the same base/head pair where applicable.
3. Detect and skip already-created tags/releases with explicit status output.

## 8. Validation Plan

1. Trigger `prepare-release` with a test version and verify PR creation/body content.
2. Merge a test release PR and verify automatic tag + GitHub Release creation.
3. Trigger `sync-release-main` twice and confirm a single sync PR is reused/updated.
4. Validate failure paths:
   - invalid version,
   - duplicate tag,
   - non-matching PR title in finalize workflow.

## 9. Rollout Plan

1. Add workflows behind manual dispatch and merge conditions.
2. Update `docs/deployment/release-howto.md` with new operator flow.
3. Monitor first real release run and confirm artifacts (PR, tag, GitHub Release, optional sync PR).

## 10. Expected Operator Experience

1. Run `prepare-release` with `vX.Y.Z`.
2. Review/merge the generated release PR.
3. Tag and GitHub Release are created automatically after merge.
4. Optionally run `sync-release-main` and merge sync PR.

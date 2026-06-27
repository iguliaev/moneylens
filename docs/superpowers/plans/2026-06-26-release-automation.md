# Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate release PR preparation, post-merge tagging/release creation, and optional `release -> main` sync PR creation with GitHub Actions.

**Architecture:** Add three focused workflows: one manual workflow to prepare/update `main -> release` PRs with generated notes, one event-driven workflow to finalize releases after approved merge into `release`, and one manual workflow to create/update sync PRs back to `main`. Keep logic idempotent so reruns update existing artifacts instead of creating duplicates.

**Tech Stack:** GitHub Actions YAML, `actions/github-script@v7`, `actions/checkout@v4`, GitHub REST API via `github-script`, `gh` CLI for operator validation.

---

## File structure

- Create `.github/workflows/prepare-release.yaml`: manual release-prep workflow (`workflow_dispatch`) with version validation, notes generation, and create/update `main -> release` PR.
- Create `.github/workflows/finalize-release.yaml`: auto finalize workflow (`pull_request` closed) that tags merged release PR merge commit and creates GitHub Release.
- Create `.github/workflows/sync-release-main.yaml`: manual sync workflow (`workflow_dispatch`) that creates/updates `release -> main` PR.
- Modify `docs/deployment/release-howto.md`: replace manual PR/tag/release steps with operator flow for new workflows and fallback guidance.

### Task 1: Build manual release-prep workflow

**Files:**
- Create: `.github/workflows/prepare-release.yaml`
- Test: GitHub Actions run history for `prepare-release.yaml`

- [ ] **Step 1: Write the failing validation check (invalid version should fail)**

Run:
```bash
gh workflow run prepare-release.yaml -f version=1.2.3
gh run list --workflow prepare-release.yaml --limit 1
```

Expected: workflow run is created and ends with failure because `1.2.3` does not match `vX.Y.Z`.

- [ ] **Step 2: Implement release-prep workflow**

```yaml
# .github/workflows/prepare-release.yaml
name: Prepare Release PR

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Release version in vX.Y.Z format"
        required: true
        type: string

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: prepare-release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Validate version format
        run: |
          VERSION="${{ inputs.version }}"
          if ! [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Invalid version: $VERSION"
            exit 1
          fi

      - name: Ensure tag does not exist
        run: |
          VERSION="${{ inputs.version }}"
          git fetch --tags --force
          if git rev-parse "$VERSION" >/dev/null 2>&1; then
            echo "Tag already exists: $VERSION"
            exit 1
          fi

      - name: Create or update release PR
        uses: actions/github-script@v7
        env:
          VERSION: ${{ inputs.version }}
        with:
          script: |
            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const version = process.env.VERSION;
            const base = "release";
            const head = "main";
            const title = `release: ${version}`;

            const tags = await github.paginate(github.rest.repos.listTags, { owner, repo, per_page: 100 });
            const previousTag = tags[0]?.name;

            const notes = await github.rest.repos.generateReleaseNotes({
              owner, repo, tag_name: version, target_commitish: "main", previous_tag_name: previousTag
            });

            const prs = await github.rest.pulls.list({ owner, repo, base, head: `${owner}:${head}`, state: "open" });
            if (prs.data.length > 0) {
              await github.rest.pulls.update({
                owner, repo, pull_number: prs.data[0].number, title, body: notes.data.body
              });
            } else {
              await github.rest.pulls.create({
                owner, repo, title, head, base, body: notes.data.body
              });
            }
```

- [ ] **Step 3: Run valid workflow dispatch and verify PR creation/update**

Run:
```bash
gh workflow run prepare-release.yaml -f version=v0.0.0
gh run list --workflow prepare-release.yaml --limit 1
```

Expected: latest run completes successfully and repository has exactly one open `main -> release` PR titled `release: v0.0.0`.

- [ ] **Step 4: Commit workflow**

```bash
git add .github/workflows/prepare-release.yaml
git commit -m "feat: add manual release prep workflow"
```

### Task 2: Build auto-finalize workflow for merged release PRs

**Files:**
- Create: `.github/workflows/finalize-release.yaml`
- Test: GitHub Actions run history for `finalize-release.yaml`

- [ ] **Step 1: Write failing gating check (non-release PR should be skipped/fail-safe)**

Run:
```bash
gh run list --workflow finalize-release.yaml --limit 5
```

Expected: no tag/release side effects for PR merges into `release` whose title does not match `release: vX.Y.Z`.

- [ ] **Step 2: Implement finalize workflow**

```yaml
# .github/workflows/finalize-release.yaml
name: Finalize Release

on:
  pull_request:
    types: [closed]
    branches: [release]

permissions:
  contents: write

concurrency:
  group: finalize-release-${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  finalize:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Extract version from PR title
        id: version
        run: |
          TITLE="${{ github.event.pull_request.title }}"
          if [[ "$TITLE" =~ ^release:\ (v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
            echo "value=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
          else
            echo "Not a release PR title; exiting."
            exit 0
          fi

      - name: Create and push tag if missing
        if: steps.version.outputs.value != ''
        run: |
          VERSION="${{ steps.version.outputs.value }}"
          SHA="${{ github.event.pull_request.merge_commit_sha }}"
          git fetch --tags --force
          if git rev-parse "$VERSION" >/dev/null 2>&1; then
            echo "Tag already exists: $VERSION"
            exit 0
          fi
          git tag -a "$VERSION" "$SHA" -m "release: $VERSION"
          git push origin "$VERSION"

      - name: Create GitHub Release
        if: steps.version.outputs.value != ''
        uses: actions/github-script@v7
        env:
          VERSION: ${{ steps.version.outputs.value }}
        with:
          script: |
            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const version = process.env.VERSION;
            const existing = await github.rest.repos.listReleases({ owner, repo, per_page: 100 });
            if (existing.data.some(r => r.tag_name === version)) return;
            await github.rest.repos.createRelease({
              owner, repo, tag_name: version, target_commitish: "release", name: version, generate_release_notes: true
            });
```

- [ ] **Step 3: Validate finalize behavior on a real release PR merge**

Run:
```bash
gh run list --workflow finalize-release.yaml --limit 1
gh release list --limit 5
git ls-remote --tags origin "v*"
```

Expected: after merging `release: vX.Y.Z` PR, one successful finalize run creates exactly one new tag and one matching GitHub Release.

- [ ] **Step 4: Commit workflow**

```bash
git add .github/workflows/finalize-release.yaml
git commit -m "feat: automate release tagging and github release creation"
```

### Task 3: Build manual sync workflow (`release -> main`)

**Files:**
- Create: `.github/workflows/sync-release-main.yaml`
- Test: GitHub Actions run history for `sync-release-main.yaml`

- [ ] **Step 1: Write failing behavior check (duplicate sync PRs must not be created)**

Run:
```bash
gh pr list --base main --head release --state open
```

Expected: at most one open sync PR exists after repeated sync workflow runs.

- [ ] **Step 2: Implement sync workflow**

```yaml
# .github/workflows/sync-release-main.yaml
name: Sync Release Back to Main

on:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: sync-release-main
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Create or update sync PR
        uses: actions/github-script@v7
        with:
          script: |
            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const base = "main";
            const head = "release";
            const title = "chore: sync release back to main";
            const body = "Post-release sync PR to keep merge commits aligned between release and main.";
            const prs = await github.rest.pulls.list({ owner, repo, base, head: `${owner}:${head}`, state: "open" });
            if (prs.data.length > 0) {
              await github.rest.pulls.update({
                owner, repo, pull_number: prs.data[0].number, title, body
              });
            } else {
              await github.rest.pulls.create({
                owner, repo, title, head, base, body
              });
            }
```

- [ ] **Step 3: Run sync workflow twice and verify single PR reuse**

Run:
```bash
gh workflow run sync-release-main.yaml
gh workflow run sync-release-main.yaml
gh pr list --base main --head release --state open
```

Expected: only one open `release -> main` PR exists; second run updates existing PR.

- [ ] **Step 4: Commit workflow**

```bash
git add .github/workflows/sync-release-main.yaml
git commit -m "feat: add manual workflow to sync release back to main"
```

### Task 4: Update release documentation for the new operator flow

**Files:**
- Modify: `docs/deployment/release-howto.md`

- [ ] **Step 1: Write failing doc-check checklist**

```md
- Old manual PR creation command removed
- Old manual tag command removed
- New workflow_dispatch commands documented
- Fallback note for PAT permissions included
```

Expected: checklist is not fully satisfied before doc update.

- [ ] **Step 2: Update release how-to content**

````md
## Step 2 — Run release preparation workflow

```bash
gh workflow run prepare-release.yaml -f version=vX.Y.Z
```

This creates or updates a `main -> release` PR titled `release: vX.Y.Z` and fills PR body with generated release notes.

## Step 3 — Review and merge release PR

Merge with merge commit after approval. Do not squash.

## Step 4 — Automatic tagging and GitHub Release

After merge, `finalize-release.yaml` creates tag `vX.Y.Z` on the merge commit and creates GitHub Release notes automatically.

## Step 5 — Optional sync back to main

```bash
gh workflow run sync-release-main.yaml
```

This creates or updates a `release -> main` sync PR for manual review and merge.
````

- [ ] **Step 3: Validate docs for consistency with workflow names**

Run:
```bash
rg -n "prepare-release|finalize-release|sync-release-main|gh workflow run" docs/deployment/release-howto.md
```

Expected: documentation references all three workflow filenames and correct CLI commands.

- [ ] **Step 4: Commit docs**

```bash
git add docs/deployment/release-howto.md
git commit -m "docs: document automated release workflows"
```

### Task 5: End-to-end rehearsal in repository environment

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Re-run prep workflow for rehearsal tag**

Run:
```bash
gh workflow run prepare-release.yaml -f version=v0.0.0
gh run list --workflow prepare-release.yaml --limit 1
```

Expected: successful run with prepared release PR.

- [ ] **Step 2: Merge rehearsal release PR and verify finalize outputs**

Run:
```bash
gh pr list --base release --head main --state open
gh run list --workflow finalize-release.yaml --limit 1
gh release list --limit 3
```

Expected: finalize workflow succeeds and new release artifact exists for rehearsal version.

- [ ] **Step 3: Trigger sync workflow and verify sync PR**

Run:
```bash
gh workflow run sync-release-main.yaml
gh pr list --base main --head release --state open
```

Expected: one open sync PR exists and is ready for manual merge.

- [ ] **Step 4: Commit any small follow-up fixes from rehearsal**

```bash
git add .github/workflows docs/deployment/release-howto.md
git commit -m "chore: harden release automation after rehearsal"
```

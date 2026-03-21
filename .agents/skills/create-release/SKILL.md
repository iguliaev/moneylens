---
name: create-release
description: Guides the user through the full moneylens release process, validates a semver tag (vX.Y.Z), shows commits about to ship, creates a PR from main → release, tags the release, creates a GitHub Release with auto-generated notes, and optionally syncs the merge commit back to main. Invoke this skill whenever the user says anything like "create a release", "make a release", "release v1.2.3", "ship a new version", "cut a release", "open a release PR", "tag a release", or asks how to deploy to production. Even if the user only mentions a version number in a deployment context, this skill should be used.
---

# create-release

Walks the user through the moneylens release process step by step.

## What you need from the user

Before doing anything, make sure you have a valid tag name. It must match `vX.Y.Z` (semantic versioning — e.g. `v1.4.2`). If the user hasn't provided one, ask for it. If they provide one in the wrong format, tell them and ask again.

## The release process

Work through these steps in order. After each step that runs a command, show the output to the user and pause briefly to let them spot anything unexpected before continuing. For steps that are potentially destructive (merging, tagging, pushing), confirm with the user before proceeding.

---

### Step 1 — Preview what will be released

Pull the latest state and show the user the commits that are on `main` but not yet on `release`:

```bash
git checkout main && git pull origin main
git fetch origin release:release
git log release..main --oneline
```

Present the commit list clearly. If there are no commits (i.e. `main` and `release` are already in sync), tell the user there is nothing to release and stop.

Ask the user: "Do these look right to you? Any surprises before we continue?"

---

### Step 2 — Create the PR from main → release

Since direct pushes to `release` are restricted by branch protection rules, the only way to release is via a PR. Create it:

```bash
gh pr create \
  --base release \
  --head main \
  --title "release: TAG" \
  --body "Production release TAG"
```

(Replace `TAG` with the actual tag, e.g. `v1.4.2`.)

Show the user the PR URL returned by `gh`. Tell them the PR needs to be reviewed and approved before the next step.

Wait for the user to say the PR is approved, or ask them if they want to merge it now (appropriate if they are the sole reviewer or have already reviewed it).

---

### Step 3 — Merge the PR

Use a regular merge commit (not squash or rebase) to preserve individual commit history on the `release` branch:

```bash
gh pr merge --merge --subject "release: TAG"
```

Confirm the merge succeeded.

---

### Step 4 — Tag the release

Pull the updated `release` branch, then create and push the tag:

```bash
git checkout release && git pull origin release
git tag TAG
git push origin TAG
```

---

### Step 5 — Create the GitHub Release

```bash
gh release create TAG \
  --title "TAG" \
  --generate-notes \
  --target release
```

`--generate-notes` builds the changelog automatically from merged PRs since the previous release. Tell the user the release URL and changelog so they can review it.

If they want to write custom release notes instead, use `--notes "..."` instead of `--generate-notes`.

---

### Step 6 — Sync back to main (optional)

Merging `main → release` creates a merge commit on `release` that doesn't exist on `main`. This can cause a minor divergence. Offer to sync it back:

> "Would you like to sync the merge commit back to main? This keeps the branches in sync and is generally recommended."

If yes:

```bash
gh pr create \
  --base main \
  --head release \
  --title "chore: sync release TAG back to main" \
  --body "Post-release sync"
gh pr merge --merge
```

---

## Hotfix releases

If the user mentions this is a hotfix (urgent fix that bypasses staging), switch to hotfix mode:

1. Branch off `release`, not `main`
2. Apply the fix on the hotfix branch
3. PR the hotfix branch → `release` (not `main → release`)
4. Tag and create the GitHub Release as normal
5. Backport to `main` via a PR from `release → main`

The PR title should be `hotfix: describe the fix` and the release title `TAG (hotfix)`.

---

## Key rules

- **Always use `--merge`**, never `--squash` or `--rebase`. Squashing destroys commit history on `release`.
- **Never push directly to `release`** — branch protection rules require a PR.
- **Tag format must be `vX.Y.Z`** — three numeric segments, lowercase `v` prefix.
  - `vX.0.0` = breaking changes
  - `v0.X.0` = new features  
  - `v0.0.X` = bug fixes / patches

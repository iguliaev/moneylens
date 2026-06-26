# How to Make a Release

This guide describes the step-by-step process for creating a production release.

## Prerequisites

- [`gh` CLI](https://cli.github.com/) installed and authenticated
- Permission to open and merge PRs into the `release` branch
- All intended changes are merged into `main` and verified on staging
- Authenticate with `GITHUB_TOKEN` first; use a PAT only if workflow permissions or branch protection require it

---

## Step 1 — Review what will be released

```bash
git checkout main && git pull origin main
git fetch origin release:release
git log release..main --oneline
```

Review the list of commits. If anything looks unexpected, resolve it before proceeding.

---

## Step 2 — Run release preparation workflow

Trigger release prep with the target version:

```bash
gh workflow run prepare-release.yaml -f version=vX.Y.Z
```

This creates or updates a `main -> release` PR titled `release: vX.Y.Z` and pre-fills the PR body with generated release notes.

---

## Step 3 — Review and merge the release PR

Review, approve, and merge the `release: vX.Y.Z` PR into `release`.

```bash
gh pr merge --merge --subject "release: vX.Y.Z"
```

> Use `--merge` (not `--squash`) to preserve individual commit history.  
> Merging into `release` automatically triggers production deployment flow.

Use [semantic versioning](https://semver.org/):
- `vX.0.0` — breaking changes
- `v0.X.0` — new features
- `v0.0.X` — bug fixes

---

## Step 4 — Automatic tag + GitHub Release

After the release PR is merged, `finalize-release.yaml` runs automatically. It creates tag `vX.Y.Z` on the merge commit and publishes the matching GitHub Release with generated notes.

---

## Step 5 — Sync main (optional but recommended)

If you want the merge commit back on `main`, trigger the sync workflow:

```bash
gh workflow run sync-release-main.yaml
```

This creates or updates a `release -> main` PR for review and merge.

---

## Hotfix Releases

For urgent fixes that bypass the normal staging flow:

```bash
# Branch off release
git checkout release && git pull origin release
git checkout -b hotfix/describe-fix

# Make your changes
git commit -m "fix: describe the fix"
git push origin hotfix/describe-fix

# Open PR into release
gh pr create --base release --head hotfix/describe-fix \
  --title "hotfix: describe the fix" --body "Hotfix for vX.Y.Z"
gh pr merge --merge

# Tag and release
git checkout release && git pull origin release
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z (hotfix)" --notes "Fix: describe the fix"

# Backport to main via PR
gh pr create --base main --head release --title "chore: backport hotfix to main"
gh pr merge --merge
```

---

## Quick Reference

| Command | Purpose |
|---|---|
| `git log release..main --oneline` | Preview commits going into release |
| `gh workflow run prepare-release.yaml -f version=vX.Y.Z` | Create/update release PR with generated notes |
| `gh pr merge --merge` | Merge with merge commit (preserves history) |
| `finalize-release.yaml` (auto on merged release PR) | Create tag and GitHub Release automatically |
| `gh workflow run sync-release-main.yaml` | Create/update optional `release -> main` sync PR |

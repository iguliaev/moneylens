# How to Make a Release

This guide describes the step-by-step process for creating a production release.

## Prerequisites

- [`gh` CLI](https://cli.github.com/) installed and authenticated
- Permission to open and merge PRs into the `release` branch
- All intended changes are merged into `main` and verified on staging

---

## Step 1 — Review what will be released

```bash
git checkout main && git pull origin main
git fetch origin release:release
git log release..main --oneline
```

Review the list of commits. If anything looks unexpected, resolve it before proceeding.

---

## Step 2 — Open a PR from main into release

Since direct pushes to `release` are restricted, create a PR via `gh`:

```bash
gh pr create --base release --head main --title "release: vX.Y.Z" --body "Production release vX.Y.Z"
```

Have the PR reviewed and approved, then merge it:

```bash
gh pr merge --merge --subject "release: vX.Y.Z"
```

> Use `--merge` (not `--squash`) to preserve individual commit history.  
> Merging into `release` automatically triggers a production deployment.

---

## Step 3 — Tag the release

Pull the updated `release` branch locally first:

```bash
git checkout release && git pull origin release
git tag vX.Y.Z
git push origin vX.Y.Z
```

Use [semantic versioning](https://semver.org/):
- `vX.0.0` — breaking changes
- `v0.X.0` — new features
- `v0.0.X` — bug fixes

---

## Step 4 — Create a GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes --target release
```

`--generate-notes` automatically generates a changelog from merged PRs since the last release.
Use `--notes "..."` instead if you prefer to write the notes manually.

---

## Step 5 — Sync main (optional but recommended)

If you want the merge commit back on `main`, open a PR from `release` → `main`:

```bash
gh pr create --base main --head release --title "chore: sync release back to main" --body "Post-release sync"
gh pr merge --merge
```

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
| `gh pr create --base release --head main` | Open release PR (required by branch rules) |
| `gh pr merge --merge` | Merge with merge commit (preserves history) |
| `git tag vX.Y.Z && git push origin vX.Y.Z` | Create and push a tag |
| `gh release create vX.Y.Z --generate-notes` | Create GitHub Release with auto changelog |

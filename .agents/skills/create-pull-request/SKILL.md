---
name: create-pull-request
description: Creates a GitHub pull request for the current changes. Use this skill whenever the user asks to "create a PR", "make a pull request", "open a PR", "submit a PR", "push and create PR", "send this for review", or any similar phrasing. Also trigger when the user says things like "commit and PR", "ship this", or "submit my changes" in a context where code changes exist. Even if the user says "just open a quick PR" or "can you PR this?" — invoke this skill.
---

# Create Pull Request

Guides the full flow from current branch state to an open GitHub PR ready for review.

## Step 1 — Understand the current state

Start by checking the repo state:

```bash
git status
git branch --show-current
git log origin/main..HEAD --oneline
```

This tells you:
- **What branch you're on** — drives whether to create a new one
- **Whether there are uncommitted changes** — you may need to commit first
- **What commits are already ahead of main** — shapes the PR description

## Step 2 — Handle uncommitted changes

If `git status` shows uncommitted changes:

1. Show the user a summary of what's changed (files modified, added, deleted)
2. Suggest a commit message based on the changes
3. Ask the user to confirm before committing:
   > "I found uncommitted changes. I'd commit them with: `feat: add user settings table`. Does that look right, or would you like a different message?"
4. Once confirmed, stage all relevant changes and commit

Be careful not to accidentally commit files that shouldn't be tracked (e.g. `.env.local`, build artifacts, `node_modules`). Check `.gitignore` covers them, and if untracked files look suspicious, ask before staging.

## Step 3 — Ensure you're on the right branch

**If you're on `main`:** Never commit directly to main unless the user explicitly asks. Create a new branch first:

```bash
git checkout -b <type>/<descriptive-name>
```

**Branch naming rules:**
- `chore/` — simple, non-functional changes: docs fixes, typo corrections, config tweaks, dependency bumps
- `bugfix/` — fixes a broken or incorrect behaviour
- `feature/` — new functionality being introduced

Choose a descriptive kebab-case name that summarises the change, not the ticket number.

**Examples:**
- `chore/fix-typo-in-readme`
- `bugfix/fix-crash-on-empty-tags`
- `feature/add-user-settings-table`

**If you're already on a non-main branch:** Use it as-is — don't create another branch.

## Step 4 — Push the branch

```bash
git push -u origin <branch-name>
```

## Step 5 — Draft the PR description

**Before writing a single word of the PR body, look for a template:**

```bash
cat .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null \
  || cat PULL_REQUEST_TEMPLATE.md 2>/dev/null \
  || ls .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null
```

**If a template exists — use it as the exact structure.** Copy the section headers verbatim and fill each one in with real content from the diff. This is not optional: reviewers expect the repo's template, and a custom structure will confuse them. Do not invent alternative section names like "## Summary" or "## Changes" when the template provides different headings.

Only remove a section (rather than writing "N/A") if it genuinely doesn't apply — for example, a docs-only PR with no database changes.

**If no template exists**, use this fallback structure:

```
## Why
[What problem does this solve? What's the motivation?]

## What Changed
[What was actually changed — files, behaviour, logic]

## Testing
[How was this tested? Manual steps? Automated tests run?]
```

Ground the description in the actual diff — read the changed files and commits, don't write generic boilerplate.

## Step 6 — Confirm with the user before submitting

Before creating the PR, show the user:
- **Title** (concise, imperative — e.g. "feat(auth): add JWT refresh endpoint")
- **Branch → target** (e.g. `feature/user-settings → main`)
- **Description preview** (full text)

Ask: "Does this look right? I'll open the PR once you confirm, or let me know what to change."

Only proceed after explicit approval.

## Step 7 — Create the PR

Prefer the GitHub MCP if available (`github-mcp-server` tools). Otherwise use `gh`:

```bash
gh pr create \
  --base main \
  --head <branch> \
  --title "<title>" \
  --body "<description>"
```

Report the PR URL to the user once created.

---

## Quick reference — branch type cheat sheet

| Change type | Branch prefix | Example |
|---|---|---|
| New feature | `feature/` | `feature/export-csv` |
| Bug fix | `bugfix/` | `bugfix/date-filter-operator` |
| Docs, config, tooling | `chore/` | `chore/update-readme` |

---
name: pr-reviewer
description: Fetches GitHub pull request review comments (both inline code comments and top-level PR comments), assesses whether each concern raised is valid by reading the actual source files, and produces a structured report with proposed fixes. Use this skill whenever the user shares a GitHub PR URL and wants review comments analyzed, feedback triaged, or fixes proposed — even if they phrase it as "look at my PR comments", "what do reviewers say?", "help me address review feedback", or "what should I fix in this PR?".
---

# PR Reviewer

Triage GitHub pull request review feedback: assess validity of each concern against the real code and propose concrete fixes.

## Workflow

### 1. Parse the PR URL

The user will provide a URL like `https://github.com/owner/repo/pull/123`.

Extract:
- `{owner}` — GitHub username or org
- `{repo}` — repository name
- `{number}` — pull request number

### 2. Fetch all comments

Run both commands to get full coverage:

**Inline review comments** (attached to specific lines of code):
```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '.[] | {path: .path, line: .line, body: .body, user: .user.login, id: .id}'
```

**Top-level PR comments** (general discussion):
```bash
gh api repos/{owner}/{repo}/issues/{number}/comments \
  --jq '.[] | {body: .body, user: .user.login, id: .id}'
```

If either command fails (e.g. rate limit, auth), note the error and continue with whatever is available.

### 3. Read the relevant source files

For each inline comment, read the file at `path` from the local working tree. Focus on the section around the commented line — a few dozen lines of context is usually enough to assess validity. For top-level comments that reference specific files or code, try to identify and read those files too.

If a file doesn't exist locally (e.g. it was deleted in the PR), note this and assess the comment on its textual merit alone.

### 4. Assess each concern

For each comment, consider:

- **Is the concern valid?** Does the code actually have the problem the reviewer describes? Reading the file directly is the ground truth — don't rely solely on the comment text.
- **Severity**: Critical (bug/security), Important (correctness/maintainability), Minor (style/nit), or Informational (question/suggestion with no clear right answer).
- **Context**: Is the reviewer working from an outdated understanding? Is this a style preference, not an objective issue?

Be honest — mark things as invalid if the reviewer appears to have misread the code, and mark things as valid even if they're uncomfortable to hear.

### 5. Propose fixes

For each valid concern:
- Explain *why* the fix addresses the root issue, not just what to change.
- Provide a concrete code snippet where possible.
- If multiple approaches are viable, pick the best one and briefly mention the trade-off.

For invalid concerns: explain why the code is actually fine and suggest a brief response the user could leave on the PR.

### 6. Output format

Produce a structured report in this format:

---

## PR Review Report: {repo}#{number}

**Summary**: N inline comments, M top-level comments. X open issues, Y already fixed, Z invalid/outdated.

---

Use one of these labels for each comment:
- **[VALID — OPEN]** — real concern, not yet addressed, needs a fix
- **[ALREADY FIXED]** — valid concern that the code already addresses (either it was fixed before the comment, or between review passes)
- **[INVALID — OUTDATED]** — reviewer appears to have misread the code or the concern no longer applies
- **[INFORMATIONAL]** — suggestion or question with no clear right answer; no action required but worth noting

### [LABEL] #{comment-id} — `{file}:{line}` (or "General")

**Reviewer**: @{user}
**Comment**: > quoted comment text

**Assessment**: One or two sentences explaining whether this is a real issue and why, with reference to the actual code.

**Proposed fix** (if VALID — OPEN):
```language
// code snippet
```

**Suggested PR response** (if ALREADY FIXED, INVALID, or INFORMATIONAL):
> "Draft reply the user can post"

---

(repeat for each comment)

---

## Action Items

A numbered list of the **[VALID — OPEN]** concerns in priority order (critical first), so the user knows exactly what to tackle and can ignore everything else.

---

Keep the tone matter-of-fact. The goal is to help the user quickly understand what actually needs fixing versus what they can safely close/dismiss.

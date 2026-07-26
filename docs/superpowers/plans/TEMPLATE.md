<!--
HOW TO USE THIS TEMPLATE (delete this whole comment block once you copy the file):

- Copy to docs/superpowers/plans/YYYY-MM-DD-short-feature-name.md and fill in.
- This doc is the single source of truth for progress tracking on the plan — don't also
  track progress in a separate doc or as a GitHub issue checklist. One thing to keep in sync,
  not two.
- Every session that touches this plan — including one that makes no code progress — ends
  with: update **Status**, and prepend a **Progress Log** entry. That's what makes the plan
  resumable days later without reconstructing state from git log.
- Progress Log is newest-entry-first. Resuming should only require reading the top entry.
- The **Implementation order** section is the actual checklist — check items off as they land,
  ideally in the same commit/PR that completes the step.
- If reality diverges from the plan mid-implementation, note it inline where it happened.
  Don't rewrite history — a plan being wrong in hindsight is fine, hiding that it was wrong
  is not.
- Only open a GitHub issue for the plan as a whole, and only if it's worth tracking
  externally (e.g. cross-referencing from PRs via "Closes #N"). Don't open one issue per
  step — this doc is the per-step tracker, GitHub issues stay for what's already sparse
  in this repo: user-facing bugs/features.
-->

# <Feature name> — implementation plan

**Date:** YYYY-MM-DD
**Status:** Not started
**Issue:** _(optional — `#NNN` if this plan is worth tracking as a GitHub issue too)_
**Source:** _(optional — link to the research/review doc this plan came from)_
**Scope:** _One or two sentences: what's in, what's explicitly out._

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **YYYY-MM-DD** — Plan created. Not started.

---

## 1. <Finding / task title>

<Description, root cause, files involved, the fix.>

---

## 2. <Next finding / task title>

...

---

## Implementation order

- [ ] 1. <step, in the order it should be done>
- [ ] 2. <step>
- [ ] 3. <step>

## Critical files

- `path/to/file` — <why it matters>

## Verification plan

1. <command or manual check>
2. <command or manual check>

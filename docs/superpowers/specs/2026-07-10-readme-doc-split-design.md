# README Docs Split Design

**Status:** Done

## Context

The root `README.md` is carrying too much content: project overview, onboarding, deployment, and a stale RPC section that no longer reflects the repo well. The docs are easier to maintain if the root README becomes a short entry point and the longer setup/deployment material lives in focused documents.

## Goals

1. Remove the outdated RPC section from the root README.
2. Make the root README a lightweight navigation page.
3. Move getting-started content into `docs/getting-started.md`.
4. Keep deployment content under `docs/deployment/`.

## Non-goals

1. No code changes.
2. No rewriting of existing deployment guides beyond link updates if needed.
3. No content rewrite beyond re-homing the current material.

## Proposed Structure

- `README.md`: short project overview plus links to getting started, deployment, and app docs.
- `docs/getting-started.md`: local setup, prerequisites, environment variables, and common commands.
- `docs/deployment/`: deployment and release-related documentation, including the existing release guide.

## Notes

- The root README should stop duplicating environment and setup instructions once the new docs exist.
- Any links from the root README should point to the new canonical docs rather than inlining long sections.

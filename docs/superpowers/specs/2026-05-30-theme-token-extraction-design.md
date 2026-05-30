# Theme token extraction design

## Problem

The current web app mixes global styling, light/dark theme values, and component-specific color literals across several files. That makes the light and dark schemes harder to reason about, and it makes small visual changes expensive because the same idea is encoded in many places.

## Goal

Extract the existing theme state into a shared token layer and move typography into a global baseline, without introducing a new color scheme. The work should preserve the current look and feel, but make the system easier to maintain and reuse.

## Scope

This work covers:

- Shared light/dark design tokens for surfaces, text, borders, status colors, and chart colors
- Global typography defaults applied once at the app entry point
- Replacing hardcoded color literals in UI components with semantic tokens where those colors are part of the current theme language
- Keeping current light/dark behavior intact

This work does not cover:

- Introducing a new brand palette
- Reworking layout or navigation structure
- Changing product copy or page composition

## Current surfaces to normalize

The current codebase already has an early token layer and global style entry points, but theme values are still scattered across page and component code. The main surfaces to normalize are:

- `apps/web-next/src/theme/tokens.ts`
- `apps/web-next/src/index.tsx` and `apps/web-next/src/index.css`
- Ant Design `ConfigProvider` wiring in `apps/web-next/src/contexts/color-mode/index.tsx`
- dashboard chart and summary components
- table, empty state, badge, and settings surfaces with hardcoded colors
- auth/title shell styling where typography is still defined locally

## Proposed structure

### 1. Shared theme tokens

Create or refine a single token module that exposes semantic values rather than page-specific color choices. The token layer should include:

- `surface`, `surfaceElevated`, `surfaceCard`
- `text`, `textSecondary`, `textMuted`
- `border`, `borderStrong`, `borderSubtle`
- `primary`, `success`, `warning`, `danger`
- `chartPalette`

Light and dark variants should share the same semantic names, with values tuned to each mode.

### 2. Global typography

Move typography defaults into the Vite app entry and Ant Design theme layer so pages inherit the same font family, base size, and text rendering rules. Page components should only override typography when they need a specific hierarchy or emphasis.

Implementation should follow the existing stack:

- keep theme values centralized in the Ant Design `theme`/`ConfigProvider` layer
- use `apps/web-next/src/index.tsx` as the Vite entrypoint for global CSS imports
- keep component styling within the current React + Refine + Ant Design structure

### 3. Component consumers

Update component code to consume tokens instead of hex literals. Prioritize places where colors communicate meaning:

- charts
- table headers and borders
- empty states
- warning/danger surfaces
- settings and auth shell accents

## Implementation order

1. Audit current hardcoded light/dark values and typography overrides.
2. Define the shared token module for both schemes.
3. Apply global typography defaults.
4. Replace component-level literals with semantic tokens.
5. Verify light and dark pages still read clearly in the app shell, tables, charts, and auth surfaces.

## Validation

The implementation should be verified with:

- TypeScript check
- app build
- targeted linting where tokenized files changed
- visual smoke testing of the app shell, dashboard, and auth pages

## Success criteria

- Light and dark styles are centralized enough that future changes touch token files first
- Typography is consistent across the app without per-page duplication
- Existing screens keep their current behavior while gaining clearer token boundaries
- No new color scheme is introduced

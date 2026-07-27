# Brand theme application (light + dark) — implementation plan

**Date:** 2026-07-27
**Status:** Not started
**Issue:** _none yet_
**Source:** `DESIGN.md`, `tmp/colors.ts`, `tmp/antd-theme.ts`, `tmp/Logo.tsx`, `brand-assets/`
**Scope:** Wire the MoneyLens brand palette (navy/blue/gold) and Inter typography into the live
`apps/web-next` antd theme (`src/theme/tokens.ts` + `src/contexts/color-mode`), for both light and
dark mode. Logo/icon asset integration is **already done** (PR #247) — out of scope here except a
docs fixup. Chart categorical palette (`CHART_SERIES_COLORS`) and antd semantic status colors
(`colorSuccess`/`colorWarning`/`colorError`) are explicitly out of scope per `DESIGN.md`'s rules.

## Progress Log

<!-- Newest entry first. One entry per session, even sessions with no code progress. -->

- **2026-07-27** — Plan created. Not started.

---

## 0. Current-state audit (context for whoever picks this up)

Before writing this plan I read `DESIGN.md`, the three draft files in `tmp/` (`colors.ts`,
`antd-theme.ts`, `Logo.tsx` — these look like an earlier draft of the theme, not wired into the
app), `brand-assets/` (source SVGs/PNGs), and the current `apps/web-next` theme/logo code. Findings:

- **Logo/icon assets: already integrated**, and already byte-identical to `brand-assets/`
  (verified `public/favicon.svg` diffs clean against `brand-assets/icons/icon-light.svg`).
  `src/assets/logo-{mark,lockup,full}-{light,dark}.svg` exist and are wired into
  `src/components/title/index.tsx` (`ProjectTitle`), used as Refine's `Title`. `index.html`
  already sets `theme-color` meta to brand navy (`#0C2340`) for dark. **Nothing to do here.**
- **Color palette: NOT applied.** `src/theme/tokens.ts` is the actual source of truth wired into
  `ConfigProvider` (via `src/contexts/color-mode/index.tsx`) — but it still uses generic antd blue
  (`colorPrimary: "#1677ff"`) and generic slate grays for dark mode (`#0f172a` / `#111827` /
  `#1f2937`), not the brand navy/blue/gold from `DESIGN.md`. The `tmp/` files contain the intended
  palette but were never merged into `tokens.ts`.
- **Light-mode text colors already coincidentally match brand tokens**: current
  `textPrimary: "#1f2937"` ≈ brand `navy900` (`#1F2A37`), current `textSecondary: "#6b7280"` ==
  brand `gray500` exactly. So light mode mostly needs a primary-color swap, not a rewrite.
- **Dark-mode surfaces need real work**: currently generic Tailwind-slate based
  (`#0f172a`/`#111827`/`#1f2937`), not the brand navy (`#0C2340`) `DESIGN.md` specifies. This is
  also the one item `DESIGN.md` itself flags as an **open decision** ("Sidebar/header background
  in dark mode currently goes fully navy... could be swapped for a more neutral dark gray... if
  full navy feels too saturated in practice") — this plan defaults to full navy per that doc, with
  a documented fallback (see step 3).
- **Gold accent: not used anywhere in the UI yet.** `DESIGN.md` names three canonical use sites:
  the "Lens" wordmark (done, it's baked into the logo SVGs), the tallest chart bar (done, baked
  into the logo SVGs), and **selected-menu-item text** (not done — no `Menu` component override
  exists in `tokens.ts` at all, so the sidebar nav currently uses antd's default selection styling
  derived from `colorPrimary`).
- **Inter font: declared but never loaded.** `APP_FONT_FAMILY` in `tokens.ts` lists `"Inter"`
  first, and `global.css` references the same stack — but there's no `@fontsource/inter` package,
  no Google Fonts `<link>` in `index.html`, and no `@import`. In practice the app is rendering in
  `system-ui`/`-apple-system` right now, silently falling through the font stack.
- **Dark-mode toggle already works end-to-end**: `ColorModeContextProvider` picks up
  system preference + `localStorage`, applies a `data-theme` attribute and CSS custom properties
  before first paint (no flash), and `Header` already has a working sun/moon `Switch`. This plan
  only changes the *values* those mechanisms apply, not the mechanism itself.
- `CHART_SERIES_COLORS` (used only in `SpendingTrendlineChart.tsx` for an arbitrary-cardinality
  per-category palette) and `SEMANTIC_COLORS` (`success`/`warning`/`error`, plus `earn`/`spend`/
  `save`) are intentionally left untouched — `DESIGN.md` explicitly says not to override antd's
  conventional status colors, and a 2-color brand palette can't provide a legible N-category
  qualitative palette anyway.

---

## 1. Merge brand tokens into `theme/tokens.ts`

Add the brand palette as a private const in `tokens.ts` (don't create a parallel `colors.ts` —
`tokens.ts` is already the single theme source of truth the rest of the app imports from):

```ts
const BRAND = {
  blue900: "#0C2340",
  blue700: "#185FA5",
  blue500: "#378ADD",
  blue300: "#85B7EB",
  blue200: "#B5D4F4",
  gold600: "#BA7517",
  gold400: "#FAC775",
  navy900: "#1F2A37",
  white: "#F3F4F6",
  gray500: "#6B7280",
  gray400: "#9CA3AF",
} as const;
```

Update `buildThemeConfig`'s light-mode token values:

| Token | Current | New | Why |
|---|---|---|---|
| `colorPrimary` | `#1677ff` | `BRAND.blue700` | brand primary, light theme |
| `colorLink` | `#1677ff` | `BRAND.blue700` | match primary |
| `colorLinkHover` | `#4096ff` | `BRAND.blue500` | brand mid-blue, not antd default |
| `textPrimary` (surface) | `#1f2937` | `BRAND.navy900` | formalize as brand token (value ~identical) |
| `textSecondary` (surface) | `#6b7280` | `BRAND.gray500` | formalize (value identical) |

Leave `colorInfo`, `colorSuccess`, `colorWarning`, `colorError` untouched (info stays tied to
primary per `DESIGN.md`; success/warning/error stay antd conventional).

---

## 2. Rebuild dark-mode surfaces around brand navy

Replace the `dark` entry of `THEME_SURFACES` with navy-derived values instead of slate:

| Token | Current (slate) | New (navy-derived) |
|---|---|---|
| `pageBackground` | `#0f172a` | `BRAND.blue900` (`#0C2340`) |
| `containerBackground` | `#111827` | `#122D4E` *(lightened navy tint — see note)* |
| `elevatedBackground` | `#1f2937` | `#17385F` *(lighter still, for popovers/dropdowns)* |
| `borderSubtle` | `#334155` | `#2A4A6B` *(blue-tinted, not slate)* |
| `borderStrong` | `#475569` | `#3D6088` |
| `textPrimary` | `#f8fafc` | `BRAND.white` (`#F3F4F6`) |
| `textSecondary` | `#cbd5e1` | `BRAND.gray400` (`#9CA3AF`) |
| `textTertiary` | `#94a3b8` | keep as-is or dim slightly (`#7C8798`) — low-stakes, eyeball it |
| `chartGrid` | `#334155` | `#2A4A6B` (reuse `borderSubtle`) |

Also set dark-mode-specific token overrides in `buildThemeConfig`:
- `colorPrimary`: `BRAND.blue300` (not blue700 — blue700 is too dark to read against navy bg)
- `colorLink`: `BRAND.blue300`
- `colorLinkHover`: `BRAND.blue200`

**Note on the derived container/elevated/border tints**: `DESIGN.md` only specifies the page
background (`blue900`) and flags this exact area as an **open decision** — it doesn't specify
lightened tints for cards/popovers/borders because those don't exist as named tokens in the logo
palette. The values above are computed lightening/desaturation of `blue900` toward `blue700`,
proposed here so dark mode has visible surface hierarchy (card vs page vs popover) rather than one
flat navy. **Treat these three as provisional — eyeball them in the running app in step 6** and
adjust if full navy across every surface feels too saturated; the fallback `DESIGN.md` names is a
more neutral dark gray with navy only as an accent (e.g. keep antd's stock dark surfaces and only
override `pageBackground`/`colorPrimary`/menu selection to navy+blue+gold). Note whichever way this
lands directly in `DESIGN.md`'s "Open decisions" section (step 5) so it isn't re-litigated next
session.

---

## 3. Gold accent on selected menu item (light + dark)

`DESIGN.md` names selected-menu-item text as one of the three sanctioned gold use-sites — currently
unimplemented. Add a `Menu` block to `components` in `buildThemeConfig`, mode-dependent:

```ts
components: {
  Layout: { /* existing */ },
  Menu: {
    itemSelectedBg: mode === "light" ? "#E8F1FA" : "#173A5E",
    itemSelectedColor: mode === "light" ? BRAND.gold600 : BRAND.gold400,
  },
},
```

Keep this as the *only* place gold appears in the component tokens — per `DESIGN.md`, gold is a
sparing accent, not a secondary UI color. Don't reuse it for buttons, links, or badges.

---

## 4. Load Inter for real

`tokens.ts` already declares `Inter` first in `APP_FONT_FAMILY`, but nothing ships the font, so
the app silently falls back to `system-ui`. Self-host via `@fontsource/inter` (avoids a Google
Fonts network request / CSP entry, works offline in dev, matches `DESIGN.md`'s stated preference
for either option):

```bash
cd apps/web-next && npm install @fontsource/inter
```

Import weights 400/500/600/700 (matches `DESIGN.md`'s stated weight range) once, in `src/index.tsx`
alongside the existing `global.css` import:

```ts
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
```

---

## 5. Accessibility / contrast check

Brand blue/gold values need a quick WCAG AA sanity check before calling this done — some brand
tokens were picked for the logo mark, not necessarily for body-text contrast:

- `blue700` (#185FA5) on white — body text / links, light mode.
- `navy900` text on `#F7F9FC`/white surfaces, light mode.
- `blue300` (#85B7EB) on `blue900` (#0C2340) — primary/links, dark mode.
- `gold600`/`gold400` on their respective menu-selected backgrounds — this is the one most likely
  to need adjustment; gold-on-light-blue-tint and gold-on-navy-tint both need to clear 4.5:1 for
  normal-size menu text.

Any pairing under 4.5:1 for text should get a locally-adjusted shade (document the deviation from
the raw palette value inline in `tokens.ts` with a one-line comment, not in `DESIGN.md` — the
palette table there should stay the canonical brand reference).

---

## 6. `DESIGN.md` maintenance

`DESIGN.md` currently describes an asset-naming scheme (`icon-light.svg`, `logo-light.svg`) that
doesn't match what's actually in `src/assets/` (`logo-mark-*.svg`, `logo-lockup-*.svg`,
`logo-full-*.svg`) or the "Implementation" section's described file layout (`src/theme/colors.ts` +
`antd-theme.ts` + `Logo.tsx`, none of which exist — the real files are `src/theme/tokens.ts` +
`src/contexts/color-mode/index.tsx` + `src/components/title/index.tsx`). Update `DESIGN.md` after
this work lands so it reflects reality for the next session:

- Fix the "Logo assets" section's filenames to match `src/assets/*.svg`.
- Fix the "Implementation" section's file list/wiring example to point at the real files
  (`theme/tokens.ts`, `contexts/color-mode/index.tsx`, `components/title/index.tsx`).
- Resolve or update the "Open decisions" bullet about dark-mode sidebar/header background based on
  what step 2 actually ships.
- Delete `tmp/colors.ts`, `tmp/antd-theme.ts`, `tmp/Logo.tsx` once merged — they're superseded
  drafts, not extra files to keep around.

---

## Implementation order

- [ ] 1. Add `BRAND` palette const + light-mode token/menu updates in `theme/tokens.ts`
- [ ] 2. Rebuild dark-mode `THEME_SURFACES` + dark-mode `colorPrimary`/`colorLink` overrides
- [ ] 3. Add mode-dependent `Menu` component tokens (gold selected text)
- [ ] 4. `npm install @fontsource/inter` in `apps/web-next`, import 400/500/600/700 in `index.tsx`
- [ ] 5. Run the app, toggle light/dark on Dashboard, Transactions, Categories, Bank Accounts,
      Tags, Budgets, Settings, and the `/login` auth page; check contrast per step 5; tune the
      provisional dark-surface tints from step 2 if navy reads too saturated
- [ ] 6. Update `DESIGN.md` per step 6; delete the superseded `tmp/` draft files

## Critical files

- `apps/web-next/src/theme/tokens.ts` — single source of truth for both theme configs; almost all
  changes land here.
- `apps/web-next/src/contexts/color-mode/index.tsx` — consumes `lightThemeConfig`/
  `darkThemeConfig`/`applyThemeMode`; no changes expected, but confirm CSS vars still track new
  surface values correctly (`CSS_VARIABLES` maps 1:1 to `THEME_SURFACES` keys).
- `apps/web-next/src/styles/global.css` — body/heading fallback font stack; confirm it renders
  Inter once step 4 lands (currently falls through to `system-ui`).
- `apps/web-next/src/index.tsx` — where the new `@fontsource/inter` imports go.
- `apps/web-next/src/components/header/index.tsx` — sanity-check the existing dark/light `Switch`
  and search dropdown still read correctly against new dark surfaces (uses `token.colorBgElevated`,
  `token.colorTextTertiary` directly).
- `DESIGN.md` — update per step 6.

## Verification plan

1. `cd apps/web-next && npm run check-types && npm run lint`
2. `npm run dev`, open the app, toggle the header's light/dark `Switch`; confirm no flash-of-wrong-
   theme on reload in either mode (tests the existing pre-paint `applyThemeMode` call still works
   with new values).
3. Visually check both modes on: Dashboard (charts, `TrendChart`/`SpendingTrendlineChart` grid
   lines still legible against new `chartGrid`), Transactions list, Categories, Bank Accounts,
   Tags, Budgets, Settings, and `/login`.
4. Confirm the sidebar's selected nav item shows gold text in both modes, and that gold appears
   nowhere else in the UI.
5. Inspect rendered `font-family` in devtools on a heading and body element — should resolve to
   `Inter`, not fall through to `system-ui`.
6. Run contrast checks (browser devtools contrast checker or a quick script) for the pairings
   listed in step 5 of the plan; adjust any token that fails AA for normal text.
7. `npm run build` to confirm the new `@fontsource/inter` import doesn't break the production
   bundle.

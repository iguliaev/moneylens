# MoneyLens Design System

Brand and UI decisions for the MoneyLens app (Refine + React + Ant Design).
This file exists so any future session (human or AI) has full context without
re-deriving these decisions from scratch.

## Product

MoneyLens is a personal finance app for tracking transactions, budgets, and
insights.

## Logo concept

A magnifying lens ("Lens") revealing an ascending bar chart ("Money") — the
app helps you zoom in on your finances and see the trend. The handle points
down-right, standard magnifying-glass orientation.

- Three bars inside the lens represent growth/insight; the tallest bar always
  carries the gold accent color as a visual highlight.
- Full lockup = icon + wordmark ("Money" + "Lens" in two colors) + tagline
  ("TRACK. BUDGET. UNDERSTAND.").
- Square app icon = lens mark only, centered on the lens circle (not the
  bounding box of the whole mark, including the handle), on a rounded-square
  background.

## Color palette

Extracted directly from the logo. Defined in `src/theme/colors.ts`.

| Token | Hex | Role |
|---|---|---|
| `blue900` | `#0C2340` | Dark navy — dark-theme background |
| `blue700` | `#185FA5` | Primary — buttons, links, active states (light theme) |
| `blue500` | `#378ADD` | Mid blue — charts, secondary accents |
| `blue300` | `#85B7EB` | Light blue — primary in dark theme, subtle fills |
| `blue200` | `#B5D4F4` | Lightest blue — dark-theme chart accents, hovers |
| `gold600` | `#BA7517` | Accent — "Lens" text / highlight bar, light theme |
| `gold400` | `#FAC775` | Accent — "Lens" text / highlight bar, dark theme |
| `navy900` | `#1F2A37` | Body text, light theme |
| `white` | `#F3F4F6` | Body text, dark theme |
| `gray500` | `#6B7280` | Secondary text, light theme |
| `gray400` | `#9CA3AF` | Secondary text, dark theme |

**Rules:**
- Gold is a single accent color — used sparingly (the "Lens" wordmark, the
  tallest chart bar, selected-menu-item text). It is not a secondary UI color
  used broadly.
- Don't override antd's default `colorSuccess` / `colorWarning` / `colorError`
  — those carry semantic meaning (transaction status, budget alerts, etc.)
  that should stay conventional (green/gold/red) regardless of brand palette.
- Dark theme isn't just "invert light theme" — background goes to the brand
  navy (`blue900`), not antd's default dark gray, so the app still feels like
  MoneyLens rather than generic antd dark mode.

## Typography

- UI font: **Inter** (400/500/600/700 weights). Chosen to pair with the
  logo's bold geometric wordmark without needing to license/ship the exact
  logo typeface app-wide.
- Headings and buttons lean toward weight 600–700 to echo the wordmark's
  boldness.
- Load via Google Fonts link or `@fontsource/inter` (self-hosted) — see
  comment in `src/theme/antd-theme.ts`.

## Implementation

Files live in `apps/web-next/src/`:

- `theme/tokens.ts` — single source of truth for theme tokens. Holds the raw
  `BRAND` palette (don't hardcode these hex values elsewhere), the
  mode-dependent primary/link/menu-selected mappings, `lightThemeConfig` /
  `darkThemeConfig` (antd v5 `ThemeConfig`, built on `theme.defaultAlgorithm`
  / `theme.darkAlgorithm`), and `applyThemeMode()`, which writes the active
  surface as CSS custom properties (`--app-*`, see `styles/global.css`) on
  `<html>` before first paint.
- `contexts/color-mode/index.tsx` — `ColorModeContextProvider`: resolves the
  initial mode from `localStorage` / `prefers-color-scheme`, persists
  changes, and feeds `lightThemeConfig`/`darkThemeConfig` into antd's
  `ConfigProvider`.
- `components/title/index.tsx` — `ProjectTitle`, the logo component used as
  Refine's `Title` prop (see "Logo assets" below for which asset it picks and
  when).
- Font: `Inter` weights 400/500/600/700 are self-hosted via
  `@fontsource/inter`, imported once in `src/index.tsx`.

Wiring in `App.tsx` (via `ColorModeContextProvider`, not directly):

```tsx
<ColorModeContextProvider>
  {/* ConfigProvider + Refine + ThemedLayout live inside here */}
  <ThemedLayout Header={Header} Title={ProjectTitle}>
    {/* routes */}
  </ThemedLayout>
</ColorModeContextProvider>
```

## Logo assets

Located in `apps/web-next/src/assets/`, three tiers rather than two — pick by
where `ProjectTitle` is rendering, not just by theme mode:

- `logo-mark-{light,dark}.svg` — square icon only, rounded-square background.
  Used when the sidebar is collapsed to icon-only, and as the favicon/
  apple-touch-icon source (copied into `apps/web-next/public/`).
- `logo-lockup-{light,dark}.svg` — icon + wordmark, no tagline. Used as the
  sidebar title when expanded.
- `logo-full-{light,dark}.svg` — icon + wordmark + tagline
  ("TRACK. BUDGET. UNDERSTAND."). Used on the `/login`, `/register`,
  `/forgot-password`, `/update-password` auth pages.

**Usage rule:** light-theme assets are for light backgrounds, dark-theme
assets are for dark backgrounds — pick by background color, not by the app's
current color mode alone (e.g. a dark-mode marketing page footer on a light
card still wants the light-theme logo).

## Open decisions / things to revisit

- ~~Sidebar/header background in dark mode currently goes fully navy~~ —
  resolved: dark mode uses `blue900` for the page background with lightened
  navy tints for container/elevated surfaces and borders (see `tokens.ts`
  `THEME_SURFACES.dark`), so hierarchy stays visible without dropping to
  generic gray. Revisit only if this reads too saturated in real use.
- antd's default "text on solid-color background" token
  (`colorTextLightSolid`) is always white, which fails WCAG AA contrast
  against dark mode's pastel `blue300` primary on filled buttons/tags
  (~2.8:1). Dark mode overrides it to `navy900` instead (~5.2:1) — light
  mode's `blue700` primary keeps white text (~6.5:1), unchanged.
- No secondary/tertiary brand color chosen yet beyond blue + gold — if a
  future feature needs a third categorical color (e.g. chart series), extend
  the palette deliberately rather than picking ad hoc. (The existing
  multi-series chart palette in `CHART_SERIES_COLORS` predates the brand
  palette and is intentionally left as antd's default categorical colors —
  a 2-hue brand palette can't provide a legible N-category qualitative set.)
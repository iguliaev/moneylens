# Visual Identity & Theme — Implementation Plan

**Date:** 2026-04-18  
**App:** MoneyLens (`apps/web-next/`)  
**Stack:** Vite · React 19 · Refine · Ant Design 5 · Supabase

---

## Context

The app currently ships `RefineThemes.Blue` with no overrides, Arial-based inline SVG text as a "logo", scattered hardcoded hex colors in production code, and a dark mode that simply swaps Ant Design's built-in algorithm with no brand-specific tuning. All of this is fixable through targeted, low-risk changes.

---

## Priority: HIGH

---

### 1. Define centralized design tokens

**What:** Create a single source-of-truth file `apps/web-next/src/theme/tokens.ts` that exports a typed object of raw brand values (colors, radii, font sizes, spacing) and a corresponding Ant Design `ThemeConfig` object.

**Why:** Every other item on this list depends on agreed token values. Without a token file, improvements to one component will diverge from another. This also makes future re-theming a one-file change.

**How:**

1. Create `apps/web-next/src/theme/tokens.ts`:
   - Define a `brandColors` const with at minimum:
     - `primary`: your chosen brand blue (e.g. `#1B6FD8` — a slightly deeper blue than AntD default `#1677ff`)
     - `success`: `#389e0d` (positive money flows, slightly warmer than AntD's `#52c41a`)
     - `danger`: `#cf1322` (negative flows; already used in `transactionTypes.ts` and `settings/index.tsx`)
     - `warning`: `#d46b08`
     - `textSecondary`: `#595959` (replaces the `#8c8c8c` in `dashboard/index.tsx`)
     - `chartPalette`: array of 8 harmonious colors derived from the brand primary (replace the raw array in `ChartsTab.tsx`)
     - `gridStroke`: `#e8e8e8` (replace `#f0f0f0` in `ChartsTab.tsx`)
   - Export a `lightThemeConfig: ThemeConfig` (from `antd`) object:
     ```
     token: {
       colorPrimary: brandColors.primary,
       colorSuccess: brandColors.success,
       colorError: brandColors.danger,
       colorWarning: brandColors.warning,
       colorTextSecondary: brandColors.textSecondary,
       borderRadius: 8,
       fontFamily: "'DM Sans', system-ui, sans-serif",   // see item #3
     }
     ```
   - Export a `darkThemeConfig: ThemeConfig` that extends `lightThemeConfig` with dark-specific overrides (see item #5).

2. In `apps/web-next/src/contexts/color-mode/index.tsx`:
   - Remove `...RefineThemes.Blue` spread.
   - Replace the `ConfigProvider` `theme` prop with:
     ```
     theme={mode === "light" ? lightThemeConfig : darkThemeConfig}
     algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
     ```
   - Keep the `algorithm` so AntD's derived palette still works.

**AntD token names to use:** `colorPrimary`, `colorSuccess`, `colorError`, `colorWarning`, `colorTextSecondary`, `borderRadius`, `fontFamily`  
Docs: https://ant.design/docs/react/customize-theme#seedtoken

**Risk / Complexity:** Low. `ConfigProvider` already wraps the whole app. No component changes required at this step.

---

### 2. Replace all hardcoded hex colors with token references

**What:** Remove every raw hex literal in business-logic code and replace it with either a token from `theme/tokens.ts` or a value read from `theme.useToken()`.

**Why:** Hardcoded colors break dark mode (a `#f0f0f0` grid line looks fine on white, invisible on dark), make re-theming impossible, and are a maintenance hazard when the design evolves.

**Files to touch and exact changes:**

| File | Current value | Replace with |
|---|---|---|
| `src/constants/transactionTypes.ts` line 40–42 | `"#3f8600"`, `"#cf1322"`, `"#1890ff"` | `brandColors.success`, `brandColors.danger`, `brandColors.primary` imported from `theme/tokens.ts` |
| `src/pages/dashboard/index.tsx` lines 280, 289, 299, 307, 368 | `"#8c8c8c"`, `"#52c41a"`, `"#ff4d4f"` | Read `token.colorTextSecondary`, `token.colorSuccess`, `token.colorError` via `theme.useToken()` at the top of the component |
| `src/pages/settings/index.tsx` lines 355–358 | `"#ff4d4f"`, `"#ffccc7"`, `"#cf1322"` | Read `token.colorError`, `token.colorErrorBorder`, `token.colorErrorText` via `theme.useToken()` |
| `src/pages/dashboard/ChartsTab.tsx` lines 29–36, 237, 385, 441 | Raw hex array, `"#f0f0f0"` | Import `brandColors.chartPalette` from `theme/tokens.ts`; read `token.colorBorderSecondary` (maps to a mode-aware border color) for grid strokes |

**How for Recharts grid strokes specifically:** Recharts does not participate in AntD's context, so you must read `token.colorBorderSecondary` (or `token.colorSplit`) via `useToken()` in the parent React component and pass it down as a prop to the chart subcomponent.

**Risk / Complexity:** Low-Medium. No logic changes, purely visual. The only risk is a mismatch if a token name is wrong — verify each against AntD 5 token list.

---

### 3. Add custom web font (DM Sans)

**What:** Load DM Sans from Google Fonts and wire it through Ant Design's `fontFamily` token so all AntD components, body text, and headings inherit it automatically.

**Why:** System fonts (`-apple-system`, `Segoe UI`, etc.) are inconsistent across platforms and give no brand differentiation. DM Sans is a modern, legible geometric sans-serif that reads well at both small (12px transaction labels) and large (dashboard stat headings) sizes.

**How:**

1. In `apps/web-next/index.html`:
   - Add in `<head>`, before any stylesheets:
     ```html
     <link rel="preconnect" href="https://fonts.googleapis.com" />
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
     <link
       href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
       rel="stylesheet"
     />
     ```
   - Using `display=swap` ensures no invisible text during font load.

2. In `apps/web-next/src/theme/tokens.ts` (created in item #1):
   - Set `fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif"` in the token object.

3. In `apps/web-next/src/index.css` (or equivalent global CSS file):
   - Add: `body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; }` as a CSS fallback for text outside AntD components.

4. Update `src/components/title/index.tsx`: change `fontFamily="Arial, Helvetica, sans-serif"` to `fontFamily="'DM Sans', system-ui, sans-serif"` in the SVG `<text>` element (or better: replace the SVG text entirely — see item #4).

**Alternative:** Use `fontsource` npm package (`npm install @fontsource/dm-sans`) and import in `index.css` to avoid the Google Fonts network request. Preferred if the app has a strict privacy policy or offline requirements.

**Risk / Complexity:** Low. Font loading is purely additive. The `display=swap` strategy prevents CLS.

---

### 4. Replace the SVG text logo with a proper SVG mark

**What:** Replace the `<text>` SVG element in `src/components/title/index.tsx` with an actual SVG logo — either a wordmark or a mark+wordmark lockup saved as `apps/web-next/src/assets/logo.svg` (light) and `apps/web-next/src/assets/logo-dark.svg` (dark).

**Why:** An SVG `<text>` element rendering Arial is not a logo — it is a text node with no visual identity. It also uses a hardcoded font family. A proper SVG asset is crisp at all sizes, portable to email/OG images/favicons, and can carry a brand icon.

**How:**

1. Design or export an SVG logo. Minimum viable approach:
   - A lens/circle icon (⬤ with inner highlight) followed by the "MoneyLens" wordmark in DM Sans Bold.
   - Export as two files: `logo.svg` (dark text, transparent background) and `logo-dark.svg` (light text).

2. Place both files in `apps/web-next/src/assets/`.

3. Rewrite `src/components/title/index.tsx`:
   ```tsx
   import LogoLight from "../../assets/logo.svg?react";   // Vite SVG-as-React via vite-plugin-svgr
   import LogoDark  from "../../assets/logo-dark.svg?react";
   const { token } = theme.useToken();
   const isDark = token.colorBgBase === '#000';   // or read ColorModeContext
   return <Link to="/"><>{isDark ? <LogoDark /> : <LogoLight />}</></Link>;
   ```
   - If `vite-plugin-svgr` is not installed: `npm install -D vite-plugin-svgr` and register it in `vite.config.ts`.
   - Alternative without the plugin: import as URL (`import logoUrl from '../../assets/logo.svg'`) and render `<img src={logoUrl} height={32} alt="MoneyLens" />`. Simpler but loses CSS-token-driven color control.

4. Also replace the favicon. Place `apps/web-next/public/favicon.svg` with a simplified icon-only mark (no wordmark) and update `index.html` `<link rel="icon">`.

**Risk / Complexity:** Medium. Depends on having a finalized logo design. The code change itself is trivial; the blocking work is the design asset production.

---

## Priority: MEDIUM

---

### 5. Add brand-specific dark-mode tokens

**What:** In `apps/web-next/src/theme/tokens.ts`, export a dedicated `darkThemeConfig` that overrides background surfaces, text contrast values, and chart palette to be intentionally tuned for dark mode, rather than relying solely on AntD's `darkAlgorithm` to derive everything.

**Why:** `darkAlgorithm` inverts AntD's palette automatically, but produces generic results — sidebar backgrounds feel too similar to content areas, and positive/negative money flow colors lose saturation. Brand-specific dark tokens ensure the app feels polished, not just "dark mode on".

**How:**

In `theme/tokens.ts`, create `darkThemeConfig`:
```
token: {
  ...lightThemeConfig.token,          // inherit brand primaries
  colorBgBase: '#0f1117',             // very dark navy, not pure black
  colorBgContainer: '#1a1d27',        // card surfaces
  colorBgElevated: '#22263a',         // header, dropdowns
  colorBgLayout: '#0f1117',           // page background
  colorSuccess: '#49aa19',            // slightly brighter green on dark bg
  colorError: '#e84749',              // slightly brighter red on dark bg
  colorTextSecondary: '#8c9ab1',      // cool-toned secondary text
}
```

Apply in `color-mode/index.tsx` by returning `darkThemeConfig` when `mode === 'dark'`.

**Key AntD token names:** `colorBgBase`, `colorBgContainer`, `colorBgElevated`, `colorBgLayout`, `colorSuccess`, `colorError`, `colorTextSecondary`

**Risk / Complexity:** Low-Medium. No component changes. Main risk is accidentally picking token values that AntD's derived palette overrides — test with AntD's theme editor (https://ant.design/theme-editor) before committing.

---

### 6. Improve the dark mode toggle UX in the header

**What:** Replace the emoji `Switch` (🌛 / 🔆) in `src/components/header/index.tsx` with an icon-button that uses AntD's `Button` with `SunOutlined` / `MoonOutlined` icons from `@ant-design/icons`.

**Why:** Emoji rendering is OS-dependent (looks different on macOS vs Windows vs Android). Using AntD icons keeps visual consistency within the design system and responds to theme color tokens.

**How:**

1. In `src/components/header/index.tsx`, replace the `<Switch>` with:
   ```tsx
   import { SunOutlined, MoonOutlined } from "@ant-design/icons";
   <Button
     type="text"
     icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
     onClick={() => setMode(mode === "light" ? "dark" : "light")}
     aria-label="Toggle color mode"
   />
   ```
2. Optionally wrap it in an AntD `Tooltip` with label "Switch to dark / light mode".

**Risk / Complexity:** Very Low. Pure UI swap, no logic change.

---

### 7. Apply consistent `borderRadius` token to card-based layouts

**What:** Audit all explicit `borderRadius` inline styles and `style={{ borderRadius: N }}` props across components and replace them with `token.borderRadius` or `token.borderRadiusLG` from `theme.useToken()`.

**Why:** Once `borderRadius: 8` is set in the theme token (item #1), any hardcoded override will create inconsistency — e.g. a card at `borderRadius: 4` next to a button at `borderRadius: 8`. Centralizing ensures visual rhythm.

**How:**

1. Run: `grep -rn "borderRadius" apps/web-next/src --include="*.tsx"` to enumerate all inline usages.
2. For each, replace literal numbers with `token.borderRadius` (4px default step) or `token.borderRadiusLG` (8px large step) — whichever matches the component scale.
3. For Recharts `<Bar>` elements that accept a `radius` prop (array), compute from `token.borderRadius / 2`.

**Risk / Complexity:** Low. Purely visual consistency pass.

---

## Priority: LOW

---

### 8. Mobile-responsive layout overrides

**What:** Add responsive breakpoint handling to `ThemedLayout` so the sidebar collapses on mobile, and the transaction list switches from a table to a card-per-row layout on small screens.

**Why:** `ThemedLayout` renders a fixed sidebar that overflows on viewport widths below ~768px. Mobile users see a broken layout.

**How:**

1. **Sidebar:** Refine's `ThemedLayout` accepts a `Sider` prop. Create `src/components/sider/index.tsx` that wraps Refine's default `ThemedSider` and adds:
   - `collapsedWidth={0}` for screens < 768px
   - AntD `useBreakpoint()` to detect mobile and pass `collapsed={isMobile}` by default
   - A floating hamburger `Button` that toggles collapsed state on mobile.

2. **Transaction list:** In `src/pages/transactions/list.tsx`, use AntD `useBreakpoint()`:
   - On `xs`/`sm`: render an AntD `List` with custom `renderItem` that outputs a `Card` per transaction.
   - On `md`+: keep the existing `Table`.

3. **Dashboard stat cards:** In `src/pages/dashboard/index.tsx`, ensure `<Col>` spans are `xs={24} sm={12} md={8}` rather than fixed spans.

4. In `src/components/header/index.tsx`:
   - On mobile, show a hamburger icon on the left to toggle the sidebar.
   - User avatar/name may truncate or hide on narrow widths; use AntD `Space` with `size="small"` and conditionally omit `Text` name.

**AntD hooks/components:** `Grid.useBreakpoint()`, `Layout.Sider` props `collapsedWidth`, `breakpoint`

**Risk / Complexity:** High. Most structural change in this list. Requires careful QA across breakpoints and browser testing. Recommend tackling in a separate sprint after token/logo work is stable.

---

### 9. Favicons and PWA meta tags

**What:** Replace the default Vite favicon with the MoneyLens brand icon and add PWA-compatible meta tags in `apps/web-next/index.html`.

**Why:** The browser tab and OS home screen still show the Vite logo. This is a basic polish issue that affects first impressions.

**How:**

1. Export the icon-only SVG mark (from item #4) as:
   - `public/favicon.svg` — SVG favicon (modern browsers)
   - `public/favicon-32x32.png` — 32×32 PNG fallback
   - `public/apple-touch-icon.png` — 180×180 PNG for iOS

2. In `apps/web-next/index.html`:
   - Update `<link rel="icon">` to `href="/favicon.svg" type="image/svg+xml"`
   - Add `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
   - Add `<meta name="theme-color" content="#1B6FD8" />` (use brand primary)
   - Add `<meta name="theme-color" content="#0f1117" media="(prefers-color-scheme: dark)" />`

3. Optionally add `public/manifest.webmanifest` for full PWA support.

**Risk / Complexity:** Very Low. No app logic involved. Blocks on having the logo asset (item #4).

---

### 10. Auth page brand polish

**What:** The `/login`, `/register`, and `/forgot-password` routes use `<AuthPage title={<ProjectTitle />} />`. Once `ProjectTitle` has the real logo (item #4), also customize the auth page container: apply a branded background color or subtle pattern, and ensure the card uses the brand `borderRadius` token.

**Why:** The auth page is the first screen new users see. The current `AuthPage` default is generic and unstyled beyond AntD defaults.

**How:**

1. Wrap each auth `<Route>` with a container `div` styled with:
   - `backgroundColor: token.colorBgLayout` (resolves to brand dark surface in dark mode)
   - `minHeight: "100vh"`, `display: "flex"`, `alignItems: "center"`, `justifyContent: "center"`

2. Pass Refine `AuthPage`'s `contentProps` prop to override the inner `Card`:
   - `contentProps={{ style: { borderRadius: token.borderRadiusLG, boxShadow: token.boxShadowSecondary } }}`

3. Optionally pass `wrapperProps` to style the outer wrapper similarly.

**Risk / Complexity:** Low. Purely additive styling; no logic impact.

---

## Implementation Order

```
Week 1:  Items #1 (tokens) → #3 (web font) → #2 (remove hardcoded colors)
Week 2:  Items #5 (dark tokens) → #6 (toggle UX) → #7 (border radius)
Week 3:  Items #4 (logo — depends on design) → #9 (favicons) → #10 (auth page)
Later:   Item #8 (mobile layout — own sprint)
```

Items #1–#3 are the highest-leverage and lowest-risk changes. They unblock all other items and should ship first.

---

## Token Reference Cheat Sheet

| Intent | Light token name | Dark override |
|---|---|---|
| Brand primary | `colorPrimary` | same |
| Positive (income) | `colorSuccess` | `#49aa19` |
| Negative (expense) | `colorError` | `#e84749` |
| Muted text | `colorTextSecondary` | `#8c9ab1` |
| Page background | `colorBgLayout` | `#0f1117` |
| Card/container | `colorBgContainer` | `#1a1d27` |
| Header/elevated | `colorBgElevated` | `#22263a` |
| Border/divider | `colorBorderSecondary` | derived |
| Chart grid lines | `colorSplit` | derived |
| Corner rounding (sm) | `borderRadius` (4) | same |
| Corner rounding (lg) | `borderRadiusLG` (8) | same |
| Body font | `fontFamily` | same |

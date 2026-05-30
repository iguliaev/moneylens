# Quiet Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Quiet Ledger visual identity across the app shell, charts, auth pages, and shared brand assets.

**Architecture:** Introduce one brand token module as the single source of truth for colors, radii, and typography, then have the app shell, chart components, and auth pages read from that module. Keep the logo, header toggle, and auth wrapper small and composable so the design stays consistent without spreading brand logic across feature pages.

**Tech Stack:** React 19, Refine, Ant Design 5, Vite, Recharts, Playwright, DM Sans via Google Fonts.

---

## File structure

- Create `apps/web-next/src/theme/tokens.ts`: brand palette plus light/dark AntD theme configs.
- Modify `apps/web-next/src/contexts/color-mode/index.tsx`: swap out `RefineThemes.Blue` for the local theme configs.
- Create `apps/web-next/src/index.css`: global font fallback and body background.
- Modify `apps/web-next/src/index.tsx`: import the global stylesheet.
- Modify `apps/web-next/index.html`: font preconnects, DM Sans stylesheet, favicon, and theme-color meta tags.
- Create `apps/web-next/src/assets/logo-mark.svg`: icon-only brand mark.
- Create `apps/web-next/public/favicon.svg`: browser tab icon that reuses the same mark.
- Modify `apps/web-next/src/components/title/index.tsx`: render the icon + wordmark lockup.
- Modify `apps/web-next/src/components/header/index.tsx`: replace the emoji switch with icon buttons.
- Create `apps/web-next/src/components/auth/BrandedAuthPage.tsx`: shared auth shell for login/register/forgot/update password pages.
- Modify `apps/web-next/src/App.tsx`: use the branded auth shell in the auth routes.
- Modify `apps/web-next/src/constants/transactionTypes.ts`, `apps/web-next/src/pages/dashboard/components/TrendChart.tsx`, `apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx`, `apps/web-next/src/pages/dashboard/components/TagBar.tsx`, `apps/web-next/src/pages/dashboard/components/TrendBadge.tsx`, `apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx`: remove hardcoded chart/status colors.
- Modify `apps/web-next/src/pages/settings/index.tsx`, `apps/web-next/src/components/EmptyState.tsx`, `apps/web-next/src/utility/budgetAlerts.ts`: replace remaining hardcoded surface/error/warning colors with tokens.
- Add `apps/web-next/e2e/tests/visual-identity.spec.ts`: smoke test for the new brand shell and auth page.

## Task 1: Establish the brand token layer and global typography

**Files:**
- Create: `apps/web-next/src/theme/tokens.ts`
- Create: `apps/web-next/src/index.css`
- Modify: `apps/web-next/src/contexts/color-mode/index.tsx`
- Modify: `apps/web-next/src/index.tsx`
- Modify: `apps/web-next/index.html`

- [ ] **Step 1: Write the theme source of truth**

```ts
// apps/web-next/src/theme/tokens.ts
import { theme, type ThemeConfig } from "antd";

export const brandColors = {
  primary: "#1b6fd8",
  success: "#49aa19",
  danger: "#cf1322",
  warning: "#d46b08",
  textSecondary: "#596579",
  chartPalette: [
    "#1b6fd8",
    "#49aa19",
    "#cf1322",
    "#d46b08",
    "#6f42c1",
    "#13c2c2",
    "#eb2f96",
    "#fadb14",
  ],
  gridStroke: "#e8e8e8",
} as const;

const baseTokens = {
  token: {
    colorPrimary: brandColors.primary,
    colorSuccess: brandColors.success,
    colorError: brandColors.danger,
    colorWarning: brandColors.warning,
    colorTextSecondary: brandColors.textSecondary,
    borderRadius: 8,
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  },
} satisfies ThemeConfig;

export const lightThemeConfig: ThemeConfig = {
  ...baseTokens,
  algorithm: theme.defaultAlgorithm,
};

export const darkThemeConfig: ThemeConfig = {
  ...baseTokens,
  algorithm: theme.darkAlgorithm,
  token: {
    ...baseTokens.token,
    colorBgBase: "#0f1117",
    colorBgLayout: "#0f1117",
    colorBgContainer: "#1a1d27",
    colorBgElevated: "#22263a",
    colorSuccess: "#49aa19",
    colorError: "#e84749",
    colorTextSecondary: "#8c9ab1",
  },
};
```

```css
/* apps/web-next/src/index.css */
html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  font-family: "DM Sans", system-ui, -apple-system, sans-serif;
  background: #f6f3ee;
  color: #132033;
}

a {
  color: inherit;
}
```

```ts
// apps/web-next/src/index.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const container = document.getElementById("root") as HTMLElement;
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```ts
// apps/web-next/src/contexts/color-mode/index.tsx
import { ConfigProvider, theme } from "antd";
import { darkThemeConfig, lightThemeConfig } from "../../theme/tokens";

return (
  <ColorModeContext.Provider
    value={{
      setMode: setColorMode,
      mode,
    }}
  >
    <ConfigProvider
      theme={mode === "light" ? lightThemeConfig : darkThemeConfig}
    >
      {children}
    </ConfigProvider>
  </ColorModeContext.Provider>
);
```

```html
<!-- apps/web-next/index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap"
  rel="stylesheet"
/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<meta name="theme-color" content="#1b6fd8" />
<meta name="theme-color" content="#0f1117" media="(prefers-color-scheme: dark)" />
```

- [ ] **Step 2: Run the TypeScript check**

Run: `cd apps/web-next && npm run check-types`

Expected: PASS with the new token module, CSS import, and theme config wiring compiling cleanly.

- [ ] **Step 3: Commit the foundation**

```bash
git add apps/web-next/src/theme/tokens.ts apps/web-next/src/index.css apps/web-next/src/index.tsx apps/web-next/src/contexts/color-mode/index.tsx apps/web-next/index.html
git commit -m "feat: add quiet ledger theme tokens"
```

## Task 2: Replace the logo text with a real brand lockup and brand the auth shell

**Files:**
- Create: `apps/web-next/src/assets/logo-mark.svg`
- Modify: `apps/web-next/src/components/title/index.tsx`
- Modify: `apps/web-next/src/components/header/index.tsx`
- Create: `apps/web-next/src/components/auth/BrandedAuthPage.tsx`
- Modify: `apps/web-next/src/App.tsx`
- Add: `apps/web-next/e2e/tests/visual-identity.spec.ts`

- [ ] **Step 1: Write the failing visual smoke test**

```ts
// apps/web-next/e2e/tests/visual-identity.spec.ts
import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  loginUser,
} from "../utils/test-helpers";

test.describe("Quiet Ledger branding", () => {
  let user: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    user = await createTestUser();
  });

  test.afterAll(async () => {
    await deleteTestUser(user.userId);
  });

  test("shows the icon + wordmark and the color mode toggle in the app shell", async ({
    page,
  }) => {
    await loginUser(page, user.email, user.password);
    await page.goto("/");

    await expect(page.getByText("MoneyLens", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /toggle color mode/i })
    ).toBeVisible();
  });

  test("renders the Quiet Ledger auth page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("MoneyLens", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /welcome back/i })
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the smoke test and confirm it fails before the brand shell exists**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/visual-identity.spec.ts`

Expected: FAIL because the app still renders the old text-only title and emoji mode switch.

- [ ] **Step 3: Implement the brand lockup and auth shell**

```svg
<!-- apps/web-next/src/assets/logo-mark.svg -->
<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="12" fill="#1B6FD8" />
  <circle cx="12" cy="11" r="2.2" fill="white" />
</svg>
```

```svg
<!-- apps/web-next/public/favicon.svg -->
<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="12" fill="#1B6FD8" />
  <circle cx="12" cy="11" r="2.2" fill="white" />
</svg>
```

```tsx
// apps/web-next/src/components/title/index.tsx
import React from "react";
import { theme } from "antd";
import { Link } from "@refinedev/core";
import logoMarkUrl from "../../assets/logo-mark.svg";

export const ProjectTitle: React.FC = () => {
  const { token } = theme.useToken();

  return (
    <Link
      to="/"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        color: token.colorTextHeading,
        textDecoration: "none",
      }}
    >
      <img src={logoMarkUrl} alt="" aria-hidden width={32} height={32} />
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>
        MoneyLens
      </span>
    </Link>
  );
};
```

```tsx
// apps/web-next/src/components/header/index.tsx
import { Button, Tooltip } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";

<Tooltip title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}>
  <Button
    type="text"
    icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
    onClick={() => setMode(mode === "light" ? "dark" : "light")}
    aria-label="Toggle color mode"
  />
</Tooltip>
```

```tsx
// apps/web-next/src/components/auth/BrandedAuthPage.tsx
import { AuthPage } from "@refinedev/antd";
import { theme } from "antd";
import { ProjectTitle } from "../title";

export const BrandedAuthPage = ({
  type,
}: {
  type: "login" | "register" | "forgotPassword" | "updatePassword";
}) => {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: token.colorBgLayout,
      }}
    >
      <AuthPage
        type={type}
        title={<ProjectTitle />}
        wrapperProps={{ style: { background: "transparent" } }}
        contentProps={{
          style: {
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
          },
        }}
      />
    </div>
  );
};
```

```tsx
// apps/web-next/src/App.tsx
import { BrandedAuthPage } from "./components/auth/BrandedAuthPage";

<Route path="/login" element={<BrandedAuthPage type="login" />} />
<Route path="/register" element={<BrandedAuthPage type="register" />} />
<Route path="/forgot-password" element={<BrandedAuthPage type="forgotPassword" />} />
<Route path="/update-password" element={<BrandedAuthPage type="updatePassword" />} />
```

- [ ] **Step 4: Re-run the smoke test**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/visual-identity.spec.ts`

Expected: PASS, with the login screen showing the Quiet Ledger shell and the authenticated shell showing the new logo + toggle.

- [ ] **Step 5: Commit the branding shell**

```bash
git add apps/web-next/src/assets/logo-mark.svg apps/web-next/src/components/title/index.tsx apps/web-next/src/components/header/index.tsx apps/web-next/src/components/auth/BrandedAuthPage.tsx apps/web-next/src/App.tsx apps/web-next/e2e/tests/visual-identity.spec.ts
git commit -m "feat: add quiet ledger brand shell"
```

## Task 3: Push the chart and summary surfaces onto shared brand tokens

**Files:**
- Modify: `apps/web-next/src/constants/transactionTypes.ts`
- Modify: `apps/web-next/src/pages/dashboard/components/TrendChart.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/TagBar.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/TrendBadge.tsx`
- Modify: `apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx`

- [ ] **Step 1: Swap the hardcoded palette for token-driven colors**

```ts
// apps/web-next/src/constants/transactionTypes.ts
import { brandColors } from "../theme/tokens";

export const TYPE_VALUE_COLORS = {
  [TRANSACTION_TYPES.EARN]: brandColors.success,
  [TRANSACTION_TYPES.SPEND]: brandColors.danger,
  [TRANSACTION_TYPES.SAVE]: brandColors.primary,
} as const;
```

```tsx
// apps/web-next/src/pages/dashboard/components/TrendChart.tsx
import { theme } from "antd";

const { token } = theme.useToken();

<CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} />
```

```tsx
// apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx
import { theme } from "antd";
import { brandColors } from "../../../theme/tokens";

const { token } = theme.useToken();
const CHART_COLORS = brandColors.chartPalette;

<CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} />
```

```tsx
// apps/web-next/src/pages/dashboard/components/TagBar.tsx
import { theme } from "antd";

const { token } = theme.useToken();

<CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} horizontal={false} />
```

- [ ] **Step 2: Run the lint pass on the chart files**

Run:

```bash
cd apps/web-next && npm run lint -- \
  src/constants/transactionTypes.ts \
  src/pages/dashboard/components/TrendChart.tsx \
  src/pages/dashboard/components/SpendingTrendlineChart.tsx \
  src/pages/dashboard/components/TagBar.tsx \
  src/pages/dashboard/components/TrendBadge.tsx \
  src/pages/dashboard/components/TypeSummaryCards.tsx
```

Expected: PASS with no hardcoded hex colors left in the dashboard chart layer.

- [ ] **Step 3: Update the metric cards and badges to use semantic tokens**

```tsx
// apps/web-next/src/pages/dashboard/components/TrendBadge.tsx
import { theme, Typography } from "antd";

const { token } = theme.useToken();

<Text style={{ ...baseStyle, color: token.colorTextSecondary }}>
```

```tsx
// apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx
import { theme } from "antd";

const { token } = theme.useToken();

valueStyle={{
  color:
    netIncome > 0
      ? token.colorSuccess
      : netIncome < 0
        ? token.colorError
        : undefined,
}}
```

- [ ] **Step 4: Re-run the TypeScript check**

Run: `cd apps/web-next && npm run check-types`

Expected: PASS, with all chart and metric components reading from the same brand palette.

- [ ] **Step 5: Commit the chart sweep**

```bash
git add apps/web-next/src/constants/transactionTypes.ts apps/web-next/src/pages/dashboard/components/TrendChart.tsx apps/web-next/src/pages/dashboard/components/SpendingTrendlineChart.tsx apps/web-next/src/pages/dashboard/components/TagBar.tsx apps/web-next/src/pages/dashboard/components/TrendBadge.tsx apps/web-next/src/pages/dashboard/components/TypeSummaryCards.tsx
git commit -m "feat: align dashboard charts with quiet ledger tokens"
```

## Task 4: Clean the remaining surfaces and verify the full experience

**Files:**
- Modify: `apps/web-next/src/pages/settings/index.tsx`
- Modify: `apps/web-next/src/components/EmptyState.tsx`
- Modify: `apps/web-next/src/utility/budgetAlerts.ts`

- [ ] **Step 1: Replace the remaining hardcoded warning, error, and muted text colors**

```tsx
// apps/web-next/src/pages/settings/index.tsx
import { theme } from "antd";

const { token } = theme.useToken();

extra={<DeleteOutlined style={{ color: token.colorError }} />}
styles={{
  header: { borderColor: token.colorErrorBorder, color: token.colorError },
  body: { borderColor: token.colorErrorBorder, color: token.colorError },
}}
```

```tsx
// apps/web-next/src/components/EmptyState.tsx
import { theme } from "antd";

const { token } = theme.useToken();

<div style={{ fontSize: 14, color: token.colorTextSecondary }}>{description}</div>
```

```ts
// apps/web-next/src/utility/budgetAlerts.ts
import { brandColors } from "../theme/tokens";

export const WARN_STROKE_COLOR = brandColors.warning;
```

- [ ] **Step 2: Run the type check again**

Run: `cd apps/web-next && npm run check-types`

Expected: PASS after the remaining surface colors are tokenized.

- [ ] **Step 3: Run a full production build**

Run: `cd apps/web-next && npm run build`

Expected: PASS, proving the new theme, brand assets, and auth wrapper do not break the app bundle.

- [ ] **Step 4: Re-run the visual smoke test**

Run: `cd apps/web-next && npm run test:e2e:ci -- e2e/tests/visual-identity.spec.ts`

Expected: PASS, confirming the logo, toggle, and auth shell still render correctly after the color sweep.

- [ ] **Step 5: Manual browser QA**

Open the app in the browser and check:

```bash
cd apps/web-next && npm run dev
```

Verify these screens visually:

1. `/login` uses the Quiet Ledger shell and branded title.
2. `/` shows the updated header and the chart surfaces use the new palette.
3. `/settings` uses the token-driven danger styling.

- [ ] **Step 6: Commit the final polish**

```bash
git add apps/web-next/src/pages/settings/index.tsx apps/web-next/src/components/EmptyState.tsx apps/web-next/src/utility/budgetAlerts.ts
git commit -m "feat: finish quiet ledger visual polish"
```

## Review checklist

- The brand token module is the only place that defines the palette.
- The auth pages and header share the same logo lockup.
- The dashboard charts no longer use hardcoded hex colors.
- The empty state, settings danger zone, and budget warning colors all flow from theme tokens.
- `npm run check-types`, `npm run build`, and the new Playwright smoke test all pass.

## Out of scope for this plan

- Mobile layout redesign.
- New motion system.
- New product pages or navigation changes.
- Any rework of data flow or business logic.

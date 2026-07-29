import { theme, type ThemeConfig } from "antd";

export type ThemeMode = "light" | "dark";

export const COLOR_MODE_ATTRIBUTE = "data-theme";

export const APP_FONT_FAMILY =
  '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const APP_CODE_FONT_FAMILY =
  '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

// MoneyLens brand palette — see DESIGN.md. Source of truth for theme tokens
// below; don't hardcode these hex values anywhere else in the app.
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

// Primary/link colors are mode-dependent: blue700 reads well on light
// surfaces, but is too dark against the navy dark-mode background, so dark
// mode uses the lighter blue300/blue200 instead (DESIGN.md).
const BRAND_PRIMARY = {
  light: { primary: BRAND.blue700, link: BRAND.blue700, linkHover: BRAND.blue500 },
  dark: { primary: BRAND.blue300, link: BRAND.blue300, linkHover: BRAND.blue200 },
} as const;

// Selected-menu-item text is one of the two sanctioned uses of the gold
// accent (the other is baked into the logo mark) — DESIGN.md says gold stays
// sparing, so it appears nowhere else in the component tokens below.
const BRAND_MENU_SELECTED = {
  light: { bg: "#E8F1FA", color: BRAND.gold600 },
  dark: { bg: "#173A5E", color: BRAND.gold400 },
} as const;

export const SEMANTIC_COLORS = {
  success: "#52c41a",
  warning: "#faad14",
  error: "#ff4d4f",
  earn: "#3f8600",
  spend: "#cf1322",
  save: "#1890ff",
} as const;

const THEME_SURFACES = {
  light: {
    pageBackground: "#F7F9FC",
    containerBackground: "#ffffff",
    elevatedBackground: "#fbfdff",
    borderSubtle: "#e5e7eb",
    borderStrong: "#d1d5db",
    textPrimary: BRAND.navy900,
    textSecondary: BRAND.gray500,
    textTertiary: "#9ca3af",
    textMuted: "#8c8c8c",
    chartGrid: "#e5e7eb",
    dangerSoft: "#fff1f0",
    dangerBorder: "#ffccc7",
    dangerText: "#cf1322",
    warningSoft: "#fff7e6",
    infoSoft: "#e6f4ff",
    successSoft: "#f6ffed",
  },
  dark: {
    // Brand navy, not generic slate — see DESIGN.md's dark-theme rule and
    // the "sidebar/header background" open decision. Container/elevated/
    // border tints are lightened derivations of blue900 (not named in
    // DESIGN.md) chosen to keep surface hierarchy visible; revisit if full
    // navy reads too saturated in practice.
    pageBackground: BRAND.blue900,
    containerBackground: "#122D4E",
    elevatedBackground: "#17385F",
    borderSubtle: "#2A4A6B",
    borderStrong: "#3D6088",
    textPrimary: BRAND.white,
    textSecondary: BRAND.gray400,
    textTertiary: "#7C8798",
    textMuted: "#94a3b8",
    chartGrid: "#2A4A6B",
    dangerSoft: "#45171a",
    dangerBorder: "#7f1d1d",
    dangerText: "#fda4af",
    warningSoft: "#422006",
    infoSoft: "#0c4a6e",
    successSoft: "#14532d",
  },
} as const;

const CSS_VARIABLES = {
  "--app-font-family": APP_FONT_FAMILY,
  "--app-code-font-family": APP_CODE_FONT_FAMILY,
  "--app-page-background": "pageBackground",
  "--app-container-background": "containerBackground",
  "--app-elevated-background": "elevatedBackground",
  "--app-border-subtle": "borderSubtle",
  "--app-border-strong": "borderStrong",
  "--app-text-primary": "textPrimary",
  "--app-text-secondary": "textSecondary",
  "--app-text-tertiary": "textTertiary",
  "--app-text-muted": "textMuted",
  "--app-chart-grid": "chartGrid",
  "--app-danger-soft": "dangerSoft",
  "--app-danger-border": "dangerBorder",
  "--app-danger-text": "dangerText",
  "--app-warning-soft": "warningSoft",
  "--app-info-soft": "infoSoft",
  "--app-success-soft": "successSoft",
} as const;

export const CHART_SERIES_COLORS = [
  "#1677ff",
  "#52c41a",
  "#ff4d4f",
  "#fa8c16",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#fadb14",
] as const;

export const TRANSACTION_TYPE_COLORS = {
  earn: "green",
  spend: "red",
  save: "blue",
} as const;

export const TRANSACTION_TYPE_VALUE_COLORS = {
  earn: SEMANTIC_COLORS.earn,
  spend: SEMANTIC_COLORS.spend,
  save: SEMANTIC_COLORS.save,
} as const;

export const TREND_MUTED_COLOR = "var(--app-text-muted, #8c8c8c)";
export const TREND_NEUTRAL_COLOR = "var(--app-text-secondary, #6b7280)";
export const TREND_POSITIVE_COLOR = SEMANTIC_COLORS.success;
export const TREND_NEGATIVE_COLOR = SEMANTIC_COLORS.error;
export const CHART_GRID_COLOR = "var(--app-chart-grid, #e5e7eb)";
export const BUDGET_WARN_STROKE_COLOR = SEMANTIC_COLORS.warning;
export const TEXT_MUTED_COLOR = "var(--app-text-muted, #8c8c8c)";
export const DANGER_TEXT_COLOR = "var(--app-danger-text, #cf1322)";
export const DANGER_BORDER_COLOR = "var(--app-danger-border, #ffccc7)";

const buildThemeConfig = (mode: ThemeMode): ThemeConfig => {
  const surface = THEME_SURFACES[mode];
  const primary = BRAND_PRIMARY[mode];
  const menuSelected = BRAND_MENU_SELECTED[mode];

  return {
    algorithm: mode === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      colorPrimary: primary.primary,
      colorInfo: primary.primary,
      colorSuccess: SEMANTIC_COLORS.success,
      colorWarning: SEMANTIC_COLORS.warning,
      colorError: SEMANTIC_COLORS.error,
      colorLink: primary.link,
      colorLinkHover: primary.linkHover,
      // antd's default "text on solid-color background" is always white,
      // which is unreadable on dark mode's pastel blue300 primary (measured
      // ~2.8:1 contrast, well under WCAG AA). blue300 itself has excellent
      // contrast as *text* against the navy page background (~7.5:1) — the
      // problem is specific to filled buttons/tags, so give those dark
      // navy text instead of white in dark mode.
      colorTextLightSolid: mode === "dark" ? BRAND.navy900 : "#ffffff",
      colorBgLayout: surface.pageBackground,
      colorBgContainer: surface.containerBackground,
      colorBgElevated: surface.elevatedBackground,
      colorBgTextHover: surface.elevatedBackground,
      colorText: surface.textPrimary,
      colorTextSecondary: surface.textSecondary,
      colorTextTertiary: surface.textTertiary,
      fontFamily: APP_FONT_FAMILY,
      fontFamilyCode: APP_CODE_FONT_FAMILY,
      borderRadius: 10,
    },
    components: {
      Layout: {
        bodyBg: surface.pageBackground,
        headerBg: surface.containerBackground,
        siderBg: surface.containerBackground,
      },
      Menu: {
        itemSelectedBg: menuSelected.bg,
        itemSelectedColor: menuSelected.color,
      },
    },
  };
};

export const lightThemeConfig = buildThemeConfig("light");
export const darkThemeConfig = buildThemeConfig("dark");

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const surface = THEME_SURFACES[mode];
  const root = document.documentElement;

  root.setAttribute(COLOR_MODE_ATTRIBUTE, mode);
  root.style.colorScheme = mode;

  for (const [cssVar, surfaceKey] of Object.entries(CSS_VARIABLES)) {
    const value =
      surfaceKey === APP_FONT_FAMILY || surfaceKey === APP_CODE_FONT_FAMILY
        ? surfaceKey
        : surface[surfaceKey as keyof typeof surface];
    root.style.setProperty(cssVar, value);
  }

  const metaThemeColors = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  for (const metaThemeColor of metaThemeColors) {
    metaThemeColor.content = surface.pageBackground;
  }
}

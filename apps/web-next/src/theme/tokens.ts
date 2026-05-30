import { theme, type ThemeConfig } from "antd";

export type ThemeMode = "light" | "dark";

export const COLOR_MODE_ATTRIBUTE = "data-theme";

export const APP_FONT_FAMILY =
  '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const APP_CODE_FONT_FAMILY =
  '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

export const SEMANTIC_COLORS = {
  primary: "#1677ff",
  info: "#1677ff",
  success: "#52c41a",
  warning: "#faad14",
  error: "#ff4d4f",
  earn: "#3f8600",
  spend: "#cf1322",
  save: "#1890ff",
} as const;

const THEME_SURFACES = {
  light: {
    pageBackground: "#f5f7fb",
    containerBackground: "#ffffff",
    elevatedBackground: "#fbfdff",
    borderSubtle: "#e5e7eb",
    borderStrong: "#d1d5db",
    textPrimary: "#1f2937",
    textSecondary: "#6b7280",
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
    pageBackground: "#0f172a",
    containerBackground: "#111827",
    elevatedBackground: "#1f2937",
    borderSubtle: "#334155",
    borderStrong: "#475569",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textTertiary: "#94a3b8",
    textMuted: "#94a3b8",
    chartGrid: "#334155",
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

export const TREND_MUTED_COLOR = "var(--app-text-muted)";
export const TREND_NEUTRAL_COLOR = "var(--app-text-secondary)";
export const TREND_POSITIVE_COLOR = SEMANTIC_COLORS.success;
export const TREND_NEGATIVE_COLOR = SEMANTIC_COLORS.error;
export const CHART_GRID_COLOR = "var(--app-chart-grid)";
export const BUDGET_WARN_STROKE_COLOR = SEMANTIC_COLORS.warning;
export const TEXT_MUTED_COLOR = "var(--app-text-muted)";
export const DANGER_TEXT_COLOR = "var(--app-danger-text)";
export const DANGER_BORDER_COLOR = "var(--app-danger-border)";

const buildThemeConfig = (mode: ThemeMode): ThemeConfig => {
  const surface = THEME_SURFACES[mode];

  return {
    algorithm: mode === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      colorPrimary: SEMANTIC_COLORS.primary,
      colorInfo: SEMANTIC_COLORS.info,
      colorSuccess: SEMANTIC_COLORS.success,
      colorWarning: SEMANTIC_COLORS.warning,
      colorError: SEMANTIC_COLORS.error,
      colorLink: SEMANTIC_COLORS.primary,
      colorLinkHover: "#4096ff",
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

import { theme, type ThemeConfig } from "antd";

export const brandColors = {
  primary: "#1b6fd8",
  success: "#49aa19",
  danger: "#cf1322",
  warning: "#d46b08",
  surface: "#f3f6fb",
  surfaceCard: "#ffffff",
  textSecondary: "#5b6578",
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
    colorBgBase: brandColors.surface,
    colorBgLayout: brandColors.surface,
    colorBgContainer: brandColors.surfaceCard,
    colorBgElevated: "#f8fbff",
    colorText: "#1f2a3d",
    colorTextHeading: "#132033",
    colorTextSecondary: brandColors.textSecondary,
    colorBorder: "#dbe2ef",
    colorBorderSecondary: "#e6ebf5",
    borderRadius: 12,
    borderRadiusLG: 16,
    boxShadowSecondary:
      "0 1px 2px rgba(19, 32, 51, 0.05), 0 10px 24px rgba(19, 32, 51, 0.08)",
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  },
  components: {
    Layout: {
      headerBg: brandColors.surfaceCard,
      bodyBg: brandColors.surface,
      siderBg: brandColors.surfaceCard,
      triggerBg: "#edf2fb",
    },
    Card: {
      colorBgContainer: brandColors.surfaceCard,
      headerBg: brandColors.surfaceCard,
    },
    Table: {
      headerBg: "#eff4ff",
      rowHoverBg: "#f8faff",
      borderColor: "#d8e1f0",
    },
    Input: {
      colorBgContainer: "#ffffff",
      activeBorderColor: brandColors.primary,
      hoverBorderColor: "#77a8e8",
    },
    Select: {
      selectorBg: "#ffffff",
      optionSelectedBg: "#e8f0fc",
    },
    Segmented: {
      trackBg: "#e9effb",
      itemSelectedBg: "#ffffff",
    },
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
    colorBorder: "#2d3550",
    colorBorderSecondary: "#313a56",
    colorSuccess: "#49aa19",
    colorError: "#e84749",
    colorTextSecondary: "#8c9ab1",
  },
  components: {
    Layout: {
      headerBg: "#1a1d27",
      bodyBg: "#0f1117",
      siderBg: "#1a1d27",
      triggerBg: "#22263a",
    },
    Table: {
      headerBg: "#1f2435",
      rowHoverBg: "#1d2233",
      borderColor: "#313a56",
    },
  },
};

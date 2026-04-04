import { ConfigProvider, theme } from "antd";
import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useState,
} from "react";

type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>(
  {} as ColorModeContextType
);

/** MoneyLens design token overrides applied on top of Ant Design defaults. */
const MONEYLENS_TOKENS = {
  token: {
    colorPrimary: "#4f46e5",        // indigo — distinctive, not generic blue
    colorSuccess: "#16a34a",        // green  — earn
    colorError: "#dc2626",          // red    — spend
    colorInfo: "#2563eb",           // blue   — save
    colorWarning: "#d97706",
    borderRadius: 6,
    fontFamily:
      "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
  },
  components: {
    Card: { borderRadiusLG: 8 },
    Table: { borderRadiusLG: 8 },
    Statistic: { contentFontSize: 24 },
  },
};

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const colorModeFromLocalStorage = localStorage.getItem("colorMode");
  const isSystemPreferenceDark = window?.matchMedia(
    "(prefers-color-scheme: dark)"
  ).matches;

  const systemPreference = isSystemPreferenceDark ? "dark" : "light";
  const [mode, setMode] = useState(
    colorModeFromLocalStorage || systemPreference
  );

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
  }, [mode]);

  const { darkAlgorithm, defaultAlgorithm } = theme;

  return (
    <ColorModeContext.Provider
      value={{
        setMode,
        mode,
      }}
    >
      <ConfigProvider
        theme={{
          ...MONEYLENS_TOKENS,
          algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};

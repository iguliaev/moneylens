import { ConfigProvider } from "antd";
import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useState,
} from "react";
import {
  applyThemeMode,
  darkThemeConfig,
  lightThemeConfig,
  type ThemeMode,
} from "../../theme/tokens";

type ColorModeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>(
  {} as ColorModeContextType
);

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const colorModeFromLocalStorage = localStorage.getItem("colorMode");
  const isSystemPreferenceDark = window?.matchMedia(
    "(prefers-color-scheme: dark)"
  ).matches;

  const systemPreference: ThemeMode = isSystemPreferenceDark ? "dark" : "light";
  const [mode, setMode] = useState<ThemeMode>(
    colorModeFromLocalStorage === "light" || colorModeFromLocalStorage === "dark"
      ? colorModeFromLocalStorage
      : systemPreference
  );

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
    applyThemeMode(mode);
  }, [mode]);

  const setColorMode = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  return (
    <ColorModeContext.Provider
      value={{
        setMode: setColorMode,
        mode,
      }}
    >
      <ConfigProvider
        theme={{
          ...(mode === "light" ? lightThemeConfig : darkThemeConfig),
        }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};

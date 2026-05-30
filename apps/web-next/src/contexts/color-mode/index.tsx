import { ConfigProvider } from "antd";
import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useState,
} from "react";
import { darkThemeConfig, lightThemeConfig } from "../../theme/tokens";

type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
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

  const systemPreference = isSystemPreferenceDark ? "dark" : "light";
  const [mode, setMode] = useState(
    colorModeFromLocalStorage || systemPreference
  );

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
    document.documentElement.setAttribute("data-color-mode", mode);
  }, [mode]);

  const setColorMode = (newMode: string) => {
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
        theme={mode === "light" ? lightThemeConfig : darkThemeConfig}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};

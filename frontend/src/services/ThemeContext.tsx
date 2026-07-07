import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "sepia" | "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}>({ theme: "sepia", setTheme: () => {}, cycleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("mathos-theme") as Theme) || "sepia";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mathos-theme", theme);
  }, [theme]);

  const themes: Theme[] = ["sepia", "light", "dark"];
  const cycleTheme = () => {
    const idx = themes.indexOf(theme);
    setThemeState(themes[(idx + 1) % themes.length]);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

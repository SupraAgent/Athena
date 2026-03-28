"use client";

import * as React from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "athena:theme:v1";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(stored);
      }
    } catch {}
  }, []);

  const toggleTheme = React.useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, [theme]);

  const value = React.useMemo(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

const ThemeContext = React.createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

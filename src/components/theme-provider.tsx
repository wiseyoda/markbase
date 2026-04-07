"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  useCallback,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.classList.toggle("dark", prefersDark);
  }
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem("markbase-theme");
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

/** Subscribe to localStorage changes (cross-tab sync). */
function subscribeToStorage(callback: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === "markbase-theme") callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToStorage,
    readStoredTheme,
    () => "system" as Theme,
  );

  // Apply the theme class whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    if (t === "system") {
      localStorage.removeItem("markbase-theme");
    } else {
      localStorage.setItem("markbase-theme", t);
    }
    applyTheme(t);
    // Dispatch a storage event so useSyncExternalStore picks up the change
    window.dispatchEvent(
      new StorageEvent("storage", { key: "markbase-theme" }),
    );
  }, []);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

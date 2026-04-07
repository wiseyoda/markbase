"use client";

import { useTheme } from "./theme-provider";

const CYCLE: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.2 1.8a.75.75 0 00-.963.963A5.5 5.5 0 0013.237 10.763a.75.75 0 00.963-.963A7 7 0 116.2 1.8z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v6.5A1.75 1.75 0 0112.25 12h-3.5v1.5h1.75a.75.75 0 010 1.5h-5a.75.75 0 010-1.5H7.25V12h-3.5A1.75 1.75 0 012 10.25v-6.5zm1.75-.25a.25.25 0 00-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-6.5a.25.25 0 00-.25-.25h-8.5z" />
    </svg>
  );
}

const ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon };
const LABELS = { light: "Light mode", dark: "Dark mode", system: "System theme" };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];

  return (
    <button
      onClick={() => setTheme(CYCLE[theme])}
      className="inline-flex items-center justify-center rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
    >
      <Icon />
    </button>
  );
}

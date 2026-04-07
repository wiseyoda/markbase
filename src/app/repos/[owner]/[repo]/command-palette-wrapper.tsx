"use client";

import {
  CommandPaletteProvider,
  type CommandItem,
} from "@/components/command-palette";
import { useTheme } from "@/components/theme-provider";
import { useSidebar } from "./sidebar";

export function CommandPaletteWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setTheme, theme } = useTheme();
  const { toggle } = useSidebar();

  const items: CommandItem[] = [
    {
      id: "dashboard",
      label: "Go to Dashboard",
      href: "/dashboard",
      section: "Navigation",
    },
    {
      id: "shares",
      label: "Shared links",
      href: "/shares",
      section: "Navigation",
    },
    {
      id: "theme",
      label: "Toggle theme",
      description: `Current: ${theme}`,
      action: () => {
        const next =
          theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
        setTheme(next);
      },
      section: "Actions",
    },
    {
      id: "sidebar",
      label: "Toggle sidebar",
      action: toggle,
      section: "Actions",
    },
  ];

  return (
    <CommandPaletteProvider items={items}>{children}</CommandPaletteProvider>
  );
}

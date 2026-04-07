"use client";

import {
  CommandPaletteProvider,
  type CommandItem,
} from "@/components/command-palette";
import { useTheme } from "@/components/theme-provider";
import { useSidebar } from "./sidebar";

interface CommandPaletteWrapperProps {
  children: React.ReactNode;
  files: string[];
  owner: string;
  repo: string;
}

export function CommandPaletteWrapper({
  children,
  files,
  owner,
  repo,
}: CommandPaletteWrapperProps) {
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
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      description: "View all shortcuts",
      action: () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
      },
      section: "Help",
    },
  ];

  const fileItems: CommandItem[] = files.map((path) => ({
    id: `file-${path}`,
    label: path.split("/").pop() || path,
    description: path,
    href: `/repos/${owner}/${repo}/${path}`,
    section: "Files",
  }));

  return (
    <CommandPaletteProvider items={items} fileItems={fileItems}>
      {children}
    </CommandPaletteProvider>
  );
}

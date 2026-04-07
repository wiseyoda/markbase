"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  action?: () => void;
  section?: string;
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface RecentFile {
  label: string;
  href: string;
  timestamp: number;
}

const RECENT_FILES_KEY = "markbase-recent-files";
const MAX_RECENT_FILES = 5;
const MAX_FILE_RESULTS = 5;

function getRecentFiles(): RecentFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentFile[];
    return parsed
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

function saveRecentFile(label: string, href: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentFiles().filter((f) => f.href !== href);
    const updated: RecentFile[] = [
      { label, href, timestamp: Date.now() },
      ...existing,
    ].slice(0, MAX_RECENT_FILES);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable
  }
}

export function CommandPaletteProvider({
  children,
  items,
  fileItems = [],
}: {
  children: ReactNode;
  items: CommandItem[];
  fileItems?: CommandItem[];
}) {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // "/" when no input is focused
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        // Check contentEditable
        if ((e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {open && (
        <CommandPaletteDialog
          items={items}
          fileItems={fileItems}
          onClose={() => setOpen(false)}
        />
      )}
    </CommandPaletteContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function CommandPaletteDialog({
  items,
  fileItems,
  onClose,
}: {
  items: CommandItem[];
  fileItems: CommandItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items: action items match on label/description,
  // file items match on filename (last path segment) only
  const filtered = useMemo(() => {
    if (!query) {
      // When no query, show recent files + action items (no file items)
      const recent = getRecentFiles();
      const recentItems: CommandItem[] = recent.map((f) => ({
        id: `recent-${f.href}`,
        label: f.label,
        description: f.href.replace(/^\/repos\/[^/]+\/[^/]+\//, ""),
        href: f.href,
        section: "Recent files",
      }));
      return [...recentItems, ...items];
    }

    const lower = query.toLowerCase();

    const filteredActions = items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower),
    );

    // File items: match against filename (last segment of description/label)
    const filteredFiles = fileItems
      .filter((item) => {
        const filename = (item.description || item.label)
          .split("/")
          .pop()
          ?.toLowerCase() || "";
        return filename.includes(lower);
      })
      .slice(0, MAX_FILE_RESULTS);

    return [...filteredActions, ...filteredFiles];
  }, [items, fileItems, query]);

  // Group by section
  const grouped = useMemo(() => {
    const groups: { section: string; items: CommandItem[] }[] = [];
    const seen = new Map<string, CommandItem[]>();

    for (const item of filtered) {
      const section = item.section || "";
      const existing = seen.get(section);
      if (existing) {
        existing.push(item);
      } else {
        const arr = [item];
        seen.set(section, arr);
        groups.push({ section, items: arr });
      }
    }

    return groups;
  }, [filtered]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Execute selected item
  const executeItem = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.href) {
        // Save to recent files if it looks like a file navigation
        if (item.section === "Files" || item.section === "Recent files") {
          saveRecentFile(item.label, item.href);
        }
        router.push(item.href);
      } else if (item.action) {
        item.action();
      }
    },
    [onClose, router],
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        );
        return;
      }

      if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        executeItem(filtered[selectedIndex]);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, selectedIndex, executeItem, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Focus trap
  useEffect(() => {
    function handleFocusOut(e: FocusEvent) {
      if (
        dialogRef.current &&
        e.relatedTarget instanceof Node &&
        !dialogRef.current.contains(e.relatedTarget)
      ) {
        inputRef.current?.focus();
      }
    }

    const dialog = dialogRef.current;
    dialog?.addEventListener("focusout", handleFocusOut);
    return () => dialog?.removeEventListener("focusout", handleFocusOut);
  }, []);

  let flatIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 animate-cp-backdrop-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="fixed top-[20%] left-1/2 z-[101] mx-4 w-full max-w-lg -translate-x-1/2 animate-cp-dialog-in"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
          {/* Search input */}
          <div className="relative flex items-center border-b border-zinc-200 dark:border-zinc-700">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="ml-4 shrink-0 text-zinc-400"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or jump to..."
              className="flex-1 bg-transparent px-3 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <kbd className="mr-3 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              {typeof navigator !== "undefined" &&
              /Mac|iPhone|iPad/.test(navigator.userAgent)
                ? "\u2318K"
                : "Ctrl+K"}
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[320px] overflow-y-auto"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
                No results found
              </p>
            ) : (
              grouped.map((group) => {
                const sectionItems = group.items.map((item) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-zinc-100 dark:bg-zinc-800"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="block text-xs text-zinc-400 dark:text-zinc-500">
                            {item.description}
                          </span>
                        )}
                      </div>
                      {item.href && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="shrink-0 text-zinc-300 dark:text-zinc-600"
                        >
                          <path
                            d="M4.5 2.5 8 6l-3.5 3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  );
                });

                return (
                  <div key={group.section || "__none"}>
                    {group.section && (
                      <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {group.section}
                      </div>
                    )}
                    {sectionItems}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

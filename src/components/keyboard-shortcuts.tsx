"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

interface KeyboardShortcutsContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue>({
  open: false,
  setOpen: () => {},
});

export function useKeyboardShortcuts() {
  return useContext(KeyboardShortcutsContext);
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

function modKey(): string {
  return isMacPlatform() ? "\u2318" : "Ctrl";
}

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

function getShortcutSections(): ShortcutSection[] {
  const mod = modKey();
  return [
    {
      title: "Navigation",
      shortcuts: [
        { keys: [mod, "K"], description: "Open command palette" },
        { keys: ["/"], description: "Focus file search" },
        { keys: ["?"], description: "Show this reference" },
        { keys: ["\u2190"], description: "Go to dashboard" },
      ],
    },
    {
      title: "Comments",
      shortcuts: [
        { keys: [mod, "Enter"], description: "Submit comment" },
        { keys: ["Escape"], description: "Cancel / close" },
      ],
    },
    {
      title: "Files",
      shortcuts: [
        { keys: ["J"], description: "Next file" },
        { keys: ["K"], description: "Previous file" },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function KeyboardShortcutsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "?") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      e.preventDefault();
      setOpen((prev) => !prev);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
      {open && <KeyboardShortcutsDialog open onClose={() => setOpen(false)} />}
    </KeyboardShortcutsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function KeyboardShortcutsDialog({ onClose }: KeyboardShortcutsProps) {
  const sections = getShortcutSections();

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 animate-cp-backdrop-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={
          "fixed top-[15%] left-1/2 z-[100] w-full max-w-md mx-4 " +
          "-translate-x-1/2 animate-cp-dialog-in"
        }
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Keyboard shortcuts
            </h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              aria-label="Close"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            {sections.map((section, sIdx) => (
              <div key={section.title} className={sIdx > 0 ? "mt-5" : ""}>
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                  {section.title}
                </h3>
                <div className="space-y-1">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {shortcut.description}
                      </span>
                      <div className="inline-flex items-center gap-1 shrink-0 ml-4">
                        {shortcut.keys.map((key, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

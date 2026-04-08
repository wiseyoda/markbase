"use client";

import {
  useState,
  useCallback,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import { Tooltip } from "@/components/tooltip";

/* ------------------------------------------------------------------ */
/* Context: shared open/close state between CommentToggle and Rail    */
/* ------------------------------------------------------------------ */

interface CommentContextValue {
  open: boolean;
  setOpen: (o: boolean) => void;
  count: number;
  setCount: (n: number) => void;
}

export const CommentContext = createContext<CommentContextValue>({
  open: true,
  setOpen: () => {},
  count: 0,
  setCount: () => {},
});

export function subscribeCommentsStorage(cb: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === "markbase-comments") cb();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function getCommentsSnapshot(): boolean | null {
  const stored = sessionStorage.getItem("markbase-comments");
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return null; // no stored preference
}

export function CommentProvider({
  children,
  initialCount,
}: {
  children: React.ReactNode;
  initialCount: number;
}) {
  const storedPref = useSyncExternalStore(
    subscribeCommentsStorage,
    getCommentsSnapshot,
    () => null,
  );
  // Use stored preference if set, otherwise open when there are comments
  const open = storedPref ?? initialCount > 0;
  const [count, setCount] = useState(initialCount);

  const setOpen = useCallback((v: boolean) => {
    sessionStorage.setItem("markbase-comments", v ? "open" : "closed");
    window.dispatchEvent(new StorageEvent("storage", { key: "markbase-comments" }));
  }, []);

  return (
    <CommentContext.Provider value={{ open, setOpen, count, setCount }}>
      {children}
    </CommentContext.Provider>
  );
}

export function CommentToggle() {
  const { open, setOpen, count } = useContext(CommentContext);
  return (
    <Tooltip content={open ? "Hide comments" : "Show comments"}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="text-zinc-500 dark:text-zinc-400"
        >
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
        </svg>
        Comments
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs text-white">
            {count}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

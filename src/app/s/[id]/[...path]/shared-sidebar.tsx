"use client";

import {
  useState,
  useContext,
  createContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { TreeNode } from "@/app/repos/[owner]/[repo]/layout";
import { FileTree } from "@/components/file-tree";
import { BottomSheet } from "@/components/bottom-sheet";
import { useIsMobile } from "@/hooks/use-media-query";

// ---------------------------------------------------------------------------
// SharedSidebar context — shared open/close state for header toggle + sidebar
// ---------------------------------------------------------------------------

interface SharedSidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SharedSidebarContext = createContext<SharedSidebarContextValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

function subscribeSidebarStorage(cb: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === "markbase-sidebar") cb();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSidebarSnapshot(): boolean {
  const stored = sessionStorage.getItem("markbase-sidebar");
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return window.innerWidth >= 1024;
}

export function SharedSidebarProvider({ children }: { children: ReactNode }) {
  const open = useSyncExternalStore(
    subscribeSidebarStorage,
    getSidebarSnapshot,
    () => true,
  );

  const setOpen = useCallback((v: boolean) => {
    sessionStorage.setItem("markbase-sidebar", v ? "open" : "closed");
    window.dispatchEvent(new StorageEvent("storage", { key: "markbase-sidebar" }));
  }, []);

  const toggle = useCallback(() => {
    const current = getSidebarSnapshot();
    sessionStorage.setItem("markbase-sidebar", current ? "closed" : "open");
    window.dispatchEvent(new StorageEvent("storage", { key: "markbase-sidebar" }));
  }, []);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, setOpen, toggle]);
  return (
    <SharedSidebarContext.Provider value={value}>
      {children}
    </SharedSidebarContext.Provider>
  );
}

export function useSharedSidebar() {
  return useContext(SharedSidebarContext);
}

// ---------------------------------------------------------------------------
// SharedSidebarToggle — rendered in the header, visible on mobile/tablet only
// ---------------------------------------------------------------------------

export function SharedSidebarToggle() {
  const { toggle } = useSharedSidebar();
  return (
    <button
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      aria-label="Toggle file tree"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SharedSidebar props & component
// ---------------------------------------------------------------------------

interface SharedSidebarProps {
  tree: TreeNode[];
  shareId: string;
  fileCount: number;
  commentCounts?: Record<string, number>;
}

export function SharedSidebar({
  tree,
  shareId,
  fileCount,
  commentCounts = {},
}: SharedSidebarProps) {
  const { open, setOpen } = useSharedSidebar();
  const isMobile = useIsMobile();
  const pathname = usePathname();

  const basePath = `/s/${shareId}`;
  const closeSidebar = useCallback(() => {
    if (window.innerWidth < 1024) {
      setOpen(false);
    }
  }, [setOpen]);

  const fileTreeContent = (
    <FileTree
      nodes={tree}
      basePath={basePath}
      pathname={pathname}
      onNavigate={closeSidebar}
      commentCounts={commentCounts}
      fileCount={fileCount}
    />
  );

  // Mobile: render inside BottomSheet
  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={closeSidebar} title="Files">
        {fileTreeContent}
      </BottomSheet>
    );
  }

  // Tablet (< lg): slide-over overlay
  return (
    <>
      {/* Tablet overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Tablet: fixed overlay */}
      <aside
        className={`${
          open ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-200 bg-white transition-transform lg:hidden dark:border-zinc-800 dark:bg-zinc-950`}
      >
        <div className="flex h-full flex-col">
          {fileTreeContent}
        </div>
      </aside>

      {/* Desktop: inline collapsible panel */}
      <aside
        className={`${
          open ? "w-64" : "w-0"
        } hidden shrink-0 overflow-hidden border-r border-zinc-200 transition-all lg:block dark:border-zinc-800`}
      >
        <div className="flex h-full w-64 flex-col">
          {fileTreeContent}
        </div>
      </aside>
    </>
  );
}

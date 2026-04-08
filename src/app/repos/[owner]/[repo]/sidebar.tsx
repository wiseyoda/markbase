"use client";

import {
  useRef,
  useEffect,
  useContext,
  createContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TreeNode } from "@/lib/tree";
import { useShareDialog } from "./share-dialog";
import { FileTree } from "@/components/file-tree";
import type { ContextMenuItem } from "@/components/file-tree";
import { BottomSheet } from "@/components/bottom-sheet";
import { Tooltip } from "@/components/tooltip";
import { useIsMobile } from "@/hooks/use-media-query";

// ---------------------------------------------------------------------------
// Sidebar context — shared open/close state for header toggle + sidebar
// ---------------------------------------------------------------------------

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
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

export function SidebarProvider({ children }: { children: ReactNode }) {
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
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

// ---------------------------------------------------------------------------
// SidebarToggle — rendered on the left side of the header
// ---------------------------------------------------------------------------

export function SidebarToggle() {
  const { toggle } = useSidebar();
  return (
    <Tooltip content="Toggle sidebar" shortcut="/">
      <button
        onClick={toggle}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        aria-label="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h3.5V2.5h-3.5zm5 0v11h7.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25h-7.5z" />
        </svg>
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Flatten tree into ordered file paths for J/K navigation
// ---------------------------------------------------------------------------

function flattenFiles(nodes: TreeNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.isFile) result.push(node.path);
    else result.push(...flattenFiles(node.children));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sidebar props & component
// ---------------------------------------------------------------------------

interface SidebarProps {
  tree: TreeNode[];
  owner: string;
  repo: string;
  fileCount: number;
  commentCounts?: Record<string, number>;
}

export function Sidebar({ tree, owner, repo, fileCount, commentCounts = {} }: SidebarProps) {
  const { open, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { openShare } = useShareDialog();

  const basePath = `/repos/${owner}/${repo}`;

  // "/" shortcut to focus sidebar search (when sidebar is visible)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Only focus when sidebar is visible: desktop (always) or mobile/tablet (when open)
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (!isDesktop && !open) return;

      e.preventDefault();
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // J/K shortcuts to navigate between files in the sidebar
  const flatFiles = useMemo(() => flattenFiles(tree), [tree]);
  const repoPrefix = `${basePath}/`;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Only when sidebar is visible: desktop or mobile/tablet when open
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (!isDesktop && !open) return;
      if (flatFiles.length === 0) return;

      e.preventDefault();

      const currentPath = pathname.startsWith(repoPrefix)
        ? pathname.slice(repoPrefix.length)
        : "";
      const currentIndex = flatFiles.indexOf(currentPath);

      let nextIndex: number;
      if (e.key === "j") {
        nextIndex = currentIndex < flatFiles.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0
          ? currentIndex - 1
          : flatFiles.length - 1;
      }

      router.push(`${repoPrefix}${flatFiles[nextIndex]}`);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, flatFiles, pathname, repoPrefix, router]);

  const closeSidebar = useCallback(() => {
    // Only close on mobile/tablet where sidebar is an overlay.
    // On desktop (lg: 1024px+), sidebar stays open after file navigation.
    if (window.innerWidth < 1024) {
      setOpen(false);
    }
  }, [setOpen]);

  // Context menu builders for authenticated sidebar
  const fileContextMenuItems = useCallback(
    (node: TreeNode): ContextMenuItem[] => {
      const folderPath = node.path.includes("/")
        ? node.path.split("/").slice(0, -1).join("/")
        : null;

      return [
        {
          label: "Share this file",
          onClick: () => openShare("file", node.path),
        },
        ...(folderPath
          ? [
              {
                label: "Share parent folder",
                onClick: () => openShare("folder", folderPath),
              },
            ]
          : []),
        {
          label: "Share entire repo",
          onClick: () => openShare("repo", null),
        },
      ];
    },
    [openShare],
  );

  const folderContextMenuItems = useCallback(
    (node: TreeNode): ContextMenuItem[] => [
      {
        label: "Share this folder",
        onClick: () => openShare("folder", node.path),
      },
      {
        label: "Share entire repo",
        onClick: () => openShare("repo", null),
      },
    ],
    [openShare],
  );

  const fileTreeContent = (
    <FileTree
      nodes={tree}
      basePath={basePath}
      pathname={pathname}
      onNavigate={closeSidebar}
      commentCounts={commentCounts}
      fileContextMenuItems={fileContextMenuItems}
      folderContextMenuItems={folderContextMenuItems}
      searchInputRef={searchInputRef}
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

  // Desktop (lg:): collapsible inline panel (width transition like comment rail)
  // Tablet (< lg): slide-over overlay with backdrop
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

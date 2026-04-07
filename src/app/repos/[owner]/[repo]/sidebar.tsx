"use client";

import {
  useState,
  useRef,
  useEffect,
  useContext,
  createContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TreeNode } from "./layout";
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

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

// ---------------------------------------------------------------------------
// SidebarToggle — rendered in the header, visible on mobile/tablet only
// ---------------------------------------------------------------------------

export function SidebarToggle() {
  const { toggle } = useSidebar();
  return (
    <Tooltip content="Toggle file tree" shortcut="/">
      <button
        onClick={toggle}
        className="inline-flex items-center justify-center rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        aria-label="Toggle file tree"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
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

  const closeSidebar = useCallback(() => setOpen(false), [setOpen]);

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

  const sidebarHeader = (
    <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Files
      </span>
      <span className="text-xs text-zinc-400 dark:text-zinc-500">
        {fileCount}
      </span>
    </div>
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

      {/* Sidebar panel */}
      <aside
        className={`${
          open ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-200 bg-white transition-transform lg:relative lg:z-auto lg:w-64 lg:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950`}
      >
        <div className="flex h-full flex-col">
          {sidebarHeader}
          {fileTreeContent}
        </div>
      </aside>
    </>
  );
}

"use client";

import {
  useState,
  useContext,
  createContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeNode } from "@/app/repos/[owner]/[repo]/layout";
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

export function SharedSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
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
      className="inline-flex items-center justify-center rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      aria-label="Toggle file tree"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// File search — filters tree nodes by name
// ---------------------------------------------------------------------------

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.isFile) {
      if (node.name.toLowerCase().includes(lower)) {
        result.push(node);
      }
    } else {
      const filteredChildren = filterTree(node.children, query);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
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
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery],
  );

  const closeSidebar = useCallback(() => setOpen(false), [setOpen]);

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

  const searchInput = (
    <div className="sticky top-0 z-10 bg-white px-2 pb-1 pt-2 dark:bg-zinc-950">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search files..."
        className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700 placeholder-zinc-400 outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-500"
      />
    </div>
  );

  const fileTree = (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {filteredTree.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          No files match &ldquo;{searchQuery}&rdquo;
        </p>
      ) : (
        <TreeView
          nodes={filteredTree}
          shareId={shareId}
          pathname={pathname}
          onNavigate={closeSidebar}
          depth={0}
          commentCounts={commentCounts}
        />
      )}
    </nav>
  );

  // Mobile: render inside BottomSheet
  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={closeSidebar} title="Files">
        {searchInput}
        {fileTree}
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
          {searchInput}
          {fileTree}
        </div>
      </aside>
    </>
  );
}

function TreeView({
  nodes,
  shareId,
  pathname,
  onNavigate,
  depth,
  commentCounts,
}: {
  nodes: TreeNode[];
  shareId: string;
  pathname: string;
  onNavigate: () => void;
  depth: number;
  commentCounts: Record<string, number>;
}) {
  return (
    <ul className={depth > 0 ? "ml-3" : ""}>
      {nodes.map((node) =>
        node.isFile ? (
          <FileItem
            key={node.path}
            node={node}
            shareId={shareId}
            pathname={pathname}
            onNavigate={onNavigate}
            commentCount={commentCounts[node.path] || 0}
          />
        ) : (
          <FolderItem
            key={node.path}
            node={node}
            shareId={shareId}
            pathname={pathname}
            onNavigate={onNavigate}
            depth={depth}
            commentCounts={commentCounts}
          />
        ),
      )}
    </ul>
  );
}

function FileItem({
  node,
  shareId,
  pathname,
  onNavigate,
  commentCount,
}: {
  node: TreeNode;
  commentCount: number;
  shareId: string;
  pathname: string;
  onNavigate: () => void;
}) {
  const href = `/s/${shareId}/${node.path}`;
  const isActive = pathname === href;

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors sm:py-1.5 ${
          isActive
            ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`shrink-0 ${isActive ? "text-blue-500 dark:text-blue-400" : "text-zinc-400"}`}
        >
          <path d="M3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v9.086A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75z" />
        </svg>
        <span className="truncate">{node.name}</span>
        {commentCount > 0 && (
          <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
            {commentCount}
          </span>
        )}
      </Link>
    </li>
  );
}

function FolderItem({
  node,
  shareId,
  pathname,
  onNavigate,
  depth,
  commentCounts,
}: {
  node: TreeNode;
  shareId: string;
  pathname: string;
  onNavigate: () => void;
  depth: number;
  commentCounts: Record<string, number>;
}) {
  const [open, setOpen] = useState(() => {
    const prefix = `/s/${shareId}/`;
    function check(n: TreeNode): boolean {
      if (n.isFile) return pathname === `${prefix}${n.path}`;
      return n.children.some(check);
    }
    return check(node);
  });

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 sm:py-1.5 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`shrink-0 text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path d="M3.22 6.22a.75.75 0 011.06 0L8 9.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 010-1.06z" />
        </svg>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="shrink-0 text-zinc-400"
        >
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
        </svg>
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <TreeView
          nodes={node.children}
          shareId={shareId}
          pathname={pathname}
          onNavigate={onNavigate}
          depth={depth + 1}
          commentCounts={commentCounts}
        />
      )}
    </li>
  );
}

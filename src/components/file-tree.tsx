"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { TreeNode } from "@/lib/tree";

// ---------------------------------------------------------------------------
// filterTree — filters tree nodes by name (shared between sidebars)
// ---------------------------------------------------------------------------

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
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
// Context menu types & component
// ---------------------------------------------------------------------------

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] min-w-[150px] rounded-md border border-zinc-200 bg-white py-0.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className="flex w-full items-center px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// FileTree — the main exported component
// ---------------------------------------------------------------------------

export interface FileTreeProps {
  nodes: TreeNode[];
  basePath: string;
  pathname: string;
  onNavigate: () => void;
  commentCounts?: Record<string, number>;
  fileContextMenuItems?: (node: TreeNode) => ContextMenuItem[];
  folderContextMenuItems?: (node: TreeNode) => ContextMenuItem[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  fileCount?: number;
}

export function FileTree({
  nodes,
  basePath,
  pathname,
  onNavigate,
  commentCounts = {},
  fileContextMenuItems,
  folderContextMenuItems,
  searchInputRef,
  fileCount,
}: FileTreeProps) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => filterTree(nodes, search), [nodes, search]);

  return (
    <>
      <div className="sticky top-0 z-10 bg-white px-2 pb-1 pt-2 dark:bg-zinc-950">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-2.5 pr-10 text-sm text-zinc-700 placeholder-zinc-400 outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          />
          {fileCount != null && (
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 dark:text-zinc-500">
              {fileCount}
            </span>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
            No files match &ldquo;{search}&rdquo;
          </p>
        ) : (
          <TreeView
            nodes={filtered}
            basePath={basePath}
            pathname={pathname}
            onNavigate={onNavigate}
            depth={0}
            commentCounts={commentCounts}
            fileContextMenuItems={fileContextMenuItems}
            folderContextMenuItems={folderContextMenuItems}
          />
        )}
      </nav>
    </>
  );
}

// ---------------------------------------------------------------------------
// TreeView — recursive tree renderer
// ---------------------------------------------------------------------------

function TreeView({
  nodes,
  basePath,
  pathname,
  onNavigate,
  depth,
  commentCounts,
  fileContextMenuItems,
  folderContextMenuItems,
}: {
  nodes: TreeNode[];
  basePath: string;
  pathname: string;
  onNavigate: () => void;
  depth: number;
  commentCounts: Record<string, number>;
  fileContextMenuItems?: (node: TreeNode) => ContextMenuItem[];
  folderContextMenuItems?: (node: TreeNode) => ContextMenuItem[];
}) {
  return (
    <ul className={depth > 0 ? "ml-3" : ""}>
      {nodes.map((node) =>
        node.isFile ? (
          <FileItem
            key={node.path}
            node={node}
            basePath={basePath}
            pathname={pathname}
            onNavigate={onNavigate}
            commentCount={commentCounts[node.path] || 0}
            contextMenuItems={fileContextMenuItems}
          />
        ) : (
          <FolderItem
            key={node.path}
            node={node}
            basePath={basePath}
            pathname={pathname}
            onNavigate={onNavigate}
            depth={depth}
            commentCounts={commentCounts}
            fileContextMenuItems={fileContextMenuItems}
            folderContextMenuItems={folderContextMenuItems}
          />
        ),
      )}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// FileItem — a single file link with optional context menu
// ---------------------------------------------------------------------------

function FileItem({
  node,
  basePath,
  pathname,
  onNavigate,
  commentCount,
  contextMenuItems,
}: {
  node: TreeNode;
  basePath: string;
  pathname: string;
  onNavigate: () => void;
  commentCount: number;
  contextMenuItems?: (node: TreeNode) => ContextMenuItem[];
}) {
  const href = `${basePath}/${node.path}`;
  const isActive = pathname === href;
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        onContextMenu={
          contextMenuItems
            ? (e) => {
                e.preventDefault();
                setCtx({ x: e.clientX, y: e.clientY });
              }
            : undefined
        }
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
      {ctx && contextMenuItems && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={contextMenuItems(node)}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// FolderItem — expandable folder with optional context menu
// ---------------------------------------------------------------------------

function FolderItem({
  node,
  basePath,
  pathname,
  onNavigate,
  depth,
  commentCounts,
  fileContextMenuItems,
  folderContextMenuItems,
}: {
  node: TreeNode;
  basePath: string;
  pathname: string;
  onNavigate: () => void;
  depth: number;
  commentCounts: Record<string, number>;
  fileContextMenuItems?: (node: TreeNode) => ContextMenuItem[];
  folderContextMenuItems?: (node: TreeNode) => ContextMenuItem[];
}) {
  const [open, setOpen] = useState(() => {
    const prefix = `${basePath}/`;
    function check(n: TreeNode): boolean {
      if (n.isFile) return pathname === `${prefix}${n.path}`;
      return n.children.some(check);
    }
    return check(node);
  });

  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        onContextMenu={
          folderContextMenuItems
            ? (e) => {
                e.preventDefault();
                setCtx({ x: e.clientX, y: e.clientY });
              }
            : undefined
        }
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
      {ctx && folderContextMenuItems && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={folderContextMenuItems(node)}
        />
      )}
      {open && (
        <TreeView
          nodes={node.children}
          basePath={basePath}
          pathname={pathname}
          onNavigate={onNavigate}
          depth={depth + 1}
          commentCounts={commentCounts}
          fileContextMenuItems={fileContextMenuItems}
          folderContextMenuItems={folderContextMenuItems}
        />
      )}
    </li>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeNode } from "./layout";
import { useShareDialog } from "./share-dialog";

interface SidebarProps {
  tree: TreeNode[];
  owner: string;
  repo: string;
  fileCount: number;
  commentCounts?: Record<string, number>;
}

export function Sidebar({ tree, owner, repo, fileCount, commentCounts = {} }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-40 rounded-full bg-zinc-900 p-3 text-white shadow-lg md:hidden dark:bg-zinc-100 dark:text-zinc-900"
        aria-label="Open file tree"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-200 bg-white transition-transform md:relative md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950`}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Files
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {fileCount}
            </span>
          </div>

          {/* File tree */}
          <nav className="flex-1 overflow-y-auto px-2 py-2">
            <TreeView
              nodes={tree}
              owner={owner}
              repo={repo}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              depth={0}
              commentCounts={commentCounts}
            />
          </nav>
        </div>
      </aside>
    </>
  );
}

function TreeView({
  nodes,
  owner,
  repo,
  pathname,
  onNavigate,
  depth,
  commentCounts,
}: {
  nodes: TreeNode[];
  owner: string;
  repo: string;
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
            owner={owner}
            repo={repo}
            pathname={pathname}
            onNavigate={onNavigate}
            commentCount={commentCounts[node.path] || 0}
          />
        ) : (
          <FolderItem
            key={node.path}
            node={node}
            owner={owner}
            repo={repo}
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

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { label: string; onClick: () => void }[];
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

function FileItem({
  node,
  owner,
  repo,
  pathname,
  onNavigate,
  commentCount,
}: {
  node: TreeNode;
  owner: string;
  repo: string;
  pathname: string;
  onNavigate: () => void;
  commentCount: number;
}) {
  const href = `/repos/${owner}/${repo}/${node.path}`;
  const isActive = pathname === href;
  const { openShare } = useShareDialog();
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  const folderPath = node.path.includes("/")
    ? node.path.split("/").slice(0, -1).join("/")
    : null;

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY });
        }}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
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
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
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
          ]}
        />
      )}
    </li>
  );
}

function FolderItem({
  node,
  owner,
  repo,
  pathname,
  onNavigate,
  depth,
  commentCounts,
}: {
  node: TreeNode;
  owner: string;
  repo: string;
  pathname: string;
  onNavigate: () => void;
  depth: number;
  commentCounts: Record<string, number>;
}) {
  // Auto-expand if this folder contains the active file
  const [open, setOpen] = useState(() => {
    const prefix = `/repos/${owner}/${repo}/`;
    function check(n: TreeNode): boolean {
      if (n.isFile) return pathname === `${prefix}${n.path}`;
      return n.children.some(check);
    }
    return check(node);
  });

  const { openShare } = useShareDialog();
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY });
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            {
              label: "Share this folder",
              onClick: () => openShare("folder", node.path),
            },
            {
              label: "Share entire repo",
              onClick: () => openShare("repo", null),
            },
          ]}
        />
      )}
      {open && (
        <TreeView
          nodes={node.children}
          owner={owner}
          repo={repo}
          pathname={pathname}
          onNavigate={onNavigate}
          depth={depth + 1}
          commentCounts={commentCounts}
        />
      )}
    </li>
  );
}

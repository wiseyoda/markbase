"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeNode } from "@/app/repos/[owner]/[repo]/layout";

interface SharedSidebarProps {
  tree: TreeNode[];
  shareId: string;
  fileCount: number;
  commentCounts?: Record<string, number>;
}

export function SharedSidebar({ tree, shareId, fileCount, commentCounts = {} }: SharedSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Files
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {fileCount}
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <TreeView nodes={tree} shareId={shareId} pathname={pathname} depth={0} commentCounts={commentCounts} />
        </nav>
      </div>
    </aside>
  );
}

function TreeView({
  nodes,
  shareId,
  pathname,
  depth,
  commentCounts,
}: {
  nodes: TreeNode[];
  shareId: string;
  pathname: string;
  depth: number;
  commentCounts: Record<string, number>;
}) {
  return (
    <ul className={depth > 0 ? "ml-3" : ""}>
      {nodes.map((node) =>
        node.isFile ? (
          <FileItem key={node.path} node={node} shareId={shareId} pathname={pathname} commentCount={commentCounts[node.path] || 0} />
        ) : (
          <FolderItem key={node.path} node={node} shareId={shareId} pathname={pathname} depth={depth} commentCounts={commentCounts} />
        ),
      )}
    </ul>
  );
}

function FileItem({
  node,
  shareId,
  pathname,
  commentCount,
}: {
  node: TreeNode;
  commentCount: number;
  shareId: string;
  pathname: string;
}) {
  const href = `/s/${shareId}/${node.path}`;
  const isActive = pathname === href;

  return (
    <li>
      <Link
        href={href}
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
    </li>
  );
}

function FolderItem({
  node,
  shareId,
  pathname,
  depth,
  commentCounts,
}: {
  node: TreeNode;
  shareId: string;
  pathname: string;
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
      {open && (
        <TreeView nodes={node.children} shareId={shareId} pathname={pathname} depth={depth + 1} commentCounts={commentCounts} />
      )}
    </li>
  );
}

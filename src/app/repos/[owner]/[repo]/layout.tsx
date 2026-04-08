import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDefaultBranch, getMarkdownTree } from "@/lib/github";
import type { MarkdownFile } from "@/lib/github";
import { Sidebar, SidebarProvider, SidebarToggle } from "./sidebar";
import { ShareButton, ShareProvider } from "./share-dialog";
import { countOpenComments } from "@/lib/comments";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip } from "@/components/tooltip";
import { Logo } from "@/components/logo";
import { CommandPaletteWrapper } from "./command-palette-wrapper";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

export function buildTree(files: MarkdownFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const childMaps = new WeakMap<TreeNode, Map<string, TreeNode>>();
  const rootMap = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    let currentMap = rootMap;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const existing = currentMap.get(name);

      if (existing) {
        current = existing.children;
        currentMap = childMaps.get(existing)!;
      } else {
        const node: TreeNode = {
          name,
          path: isFile ? file.path : parts.slice(0, i + 1).join("/"),
          children: [],
          isFile,
        };
        const nodeMap = new Map<string, TreeNode>();
        childMaps.set(node, nodeMap);
        current.push(node);
        currentMap.set(name, node);
        current = node.children;
        currentMap = nodeMap;
      }
    }
  }

  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      sortTree(node.children);
    }
  }

  sortTree(root);
  return root;
}

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { owner, repo } = await params;
  const branch = await getDefaultBranch(session.accessToken, owner, repo);
  const fullRepo = `${owner}/${repo}`;
  const fileKeyPrefix = `${fullRepo}/${branch}/`;

  const [files, commentCounts] = await Promise.all([
    getMarkdownTree(session.accessToken, owner, repo, branch),
    countOpenComments(fileKeyPrefix),
  ]);

  // Convert file_key based counts to path-based counts
  const pathCounts: Record<string, number> = {};
  for (const [key, { count }] of Object.entries(commentCounts)) {
    const path = key.slice(fileKeyPrefix.length);
    pathCounts[path] = count;
  }

  const tree = buildTree(files);
  const fileCount = files.length;

  return (
    <ShareProvider repo={`${owner}/${repo}`} branch={branch}>
    <SidebarProvider>
    <KeyboardShortcutsProvider>
    <CommandPaletteWrapper files={files.map(f => f.path)} owner={owner} repo={repo}>
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <SidebarToggle />
          <Link href="/dashboard" className="flex shrink-0 items-center gap-1.5 font-semibold">
            <Logo />
            markbase
          </Link>
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600">/</span>
          <Link
            href={`/repos/${owner}/${repo}`}
            className="min-w-0 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span className="block max-w-[200px] truncate sm:max-w-none">
              {owner}/{repo}
            </span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ShareButton
            repo={`${owner}/${repo}`}
            branch={branch}
          />
          <ThemeToggle />
          <Tooltip content="Dashboard">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.906.664a1.749 1.749 0 012.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0113.25 15h-3.5a.75.75 0 01-.75-.75V9H7v5.25a.75.75 0 01-.75.75h-3.5A1.75 1.75 0 011 13.25V6.23c0-.531.242-1.034.657-1.366l5.25-4.2z" />
              </svg>
            </Link>
          </Tooltip>
        </div>
      </header>

      {/* Sidebar + Content */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          tree={tree}
          owner={owner}
          repo={repo}
          fileCount={fileCount}
          commentCounts={pathCounts}
        />
        <main id="main-content" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
    </CommandPaletteWrapper>
    </KeyboardShortcutsProvider>
    </SidebarProvider>
    </ShareProvider>
  );
}

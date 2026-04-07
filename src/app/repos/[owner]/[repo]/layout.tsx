import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDefaultBranch, getMarkdownTree } from "@/lib/github";
import type { MarkdownFile } from "@/lib/github";
import { Sidebar, SidebarProvider, SidebarToggle } from "./sidebar";
import { ShareButton, ShareProvider } from "./share-dialog";
import { SharesDropdown } from "./shares-dropdown";
import { countOpenComments } from "@/lib/comments";
import { listSharesForRepo } from "@/lib/shares";
import { ThemeToggle } from "@/components/theme-toggle";
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

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const existing = current.find((n) => n.name === name);

      if (existing) {
        current = existing.children;
      } else {
        const node: TreeNode = {
          name,
          path: isFile ? file.path : parts.slice(0, i + 1).join("/"),
          children: [],
          isFile,
        };
        current.push(node);
        current = node.children;
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

  const userId = session.user?.id || "";
  const [files, commentCounts, repoShares] = await Promise.all([
    getMarkdownTree(session.accessToken, owner, repo, branch),
    countOpenComments(fileKeyPrefix),
    userId ? listSharesForRepo(userId, fullRepo) : Promise.resolve([]),
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
          <Link href="/dashboard" className="shrink-0 font-semibold">
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
          <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 sm:inline dark:bg-zinc-800 dark:text-zinc-400">
            {branch}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <SidebarToggle />
          <SharesDropdown shares={repoShares} />
          <ShareButton
            repo={`${owner}/${repo}`}
            branch={branch}
          />
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md p-2 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <span className="sm:hidden">←</span>
            <span className="hidden sm:inline">← Dashboard</span>
          </Link>
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

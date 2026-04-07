import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDefaultBranch, getMarkdownTree } from "@/lib/github";
import type { MarkdownFile } from "@/lib/github";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

function buildTree(files: MarkdownFile[]): TreeNode[] {
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

  // Sort: folders first, then files, alphabetical within each
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

function FileTree({
  nodes,
  owner,
  repo,
  depth,
}: {
  nodes: TreeNode[];
  owner: string;
  repo: string;
  depth: number;
}) {
  return (
    <ul className={depth > 0 ? "ml-4 border-l border-zinc-200 pl-3 dark:border-zinc-800" : ""}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.isFile ? (
            <Link
              href={`/repos/${owner}/${repo}/${node.path}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="shrink-0 text-zinc-400"
              >
                <path d="M3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v9.086A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75z" />
              </svg>
              {node.name}
            </Link>
          ) : (
            <div>
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="shrink-0 text-zinc-400"
                >
                  <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
                </svg>
                {node.name}
              </div>
              <FileTree nodes={node.children} owner={owner} repo={repo} depth={depth + 1} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function RepoFilesPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { owner, repo } = await params;
  const branch = await getDefaultBranch(session.accessToken, owner, repo);
  const files = await getMarkdownTree(session.accessToken, owner, repo, branch);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/repos" className="text-lg font-semibold">
          markbase
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {owner}/{repo}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {branch}
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        {files.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            No markdown files found in this repo.
          </p>
        ) : (
          <>
            <div className="mb-4 text-sm text-zinc-400 dark:text-zinc-500">
              {files.length} markdown {files.length === 1 ? "file" : "files"}
            </div>
            <FileTree nodes={buildTree(files)} owner={owner} repo={repo} depth={0} />
          </>
        )}
      </main>
    </div>
  );
}

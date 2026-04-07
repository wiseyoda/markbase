import { notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { getShare } from "@/lib/shares";
import { getFileContent, getMarkdownTree } from "@/lib/github";
import { buildTree } from "@/app/repos/[owner]/[repo]/layout";
import { SharedSidebar } from "./shared-sidebar";
import "highlight.js/styles/github-dark.css";

function resolveShareLink(
  href: string,
  currentPath: string,
  shareId: string,
  folderScope: string | null,
): { url: string; inScope: boolean } {
  if (
    href.startsWith("http") ||
    href.startsWith("#") ||
    href.startsWith("mailto:")
  ) {
    return { url: href, inScope: true };
  }

  const currentDir = currentPath.split("/").slice(0, -1).join("/");
  const parts = (currentDir ? `${currentDir}/${href}` : href).split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== ".") resolved.push(part);
  }

  const resolvedPath = resolved.join("/");

  if (resolvedPath.endsWith(".md")) {
    // Check if link is within folder scope
    if (folderScope && !resolvedPath.startsWith(folderScope + "/")) {
      return { url: resolvedPath, inScope: false };
    }
    return { url: `/s/${shareId}/${resolvedPath}`, inScope: true };
  }

  return { url: href, inScope: true };
}

export default async function SharedFilePage({
  params,
}: {
  params: Promise<{ id: string; path: string[] }>;
}) {
  const { id, path: pathSegments } = await params;
  const share = await getShare(id);

  if (!share || (share.type !== "repo" && share.type !== "folder")) notFound();

  const [owner, repo] = share.repo.split("/");
  const filePath = pathSegments.join("/");

  // For folder shares, verify the path is within the shared folder
  if (share.type === "folder" && share.file_path) {
    if (!filePath.startsWith(share.file_path + "/")) {
      notFound();
    }
  }

  const [content, allFiles] = await Promise.all([
    getFileContent(share.accessToken, owner, repo, share.branch, filePath),
    (share.type === "repo" || share.type === "folder")
      ? getMarkdownTree(share.accessToken, owner, repo, share.branch)
      : Promise.resolve([]),
  ]);

  if (!content) notFound();

  const folderScope = share.type === "folder" ? share.file_path : null;

  // Build sidebar tree for repo/folder shares
  let sidebarFiles = allFiles;
  if (share.type === "folder" && share.file_path) {
    const prefix = share.file_path + "/";
    sidebarFiles = allFiles.filter((f) => f.path.startsWith(prefix));
  }
  const showSidebar = (share.type === "repo" || share.type === "folder") && sidebarFiles.length > 0;
  const tree = showSidebar ? buildTree(sidebarFiles) : [];

  const components: Components = {
    a: ({ href, children, ...props }) => {
      const { url, inScope } = href
        ? resolveShareLink(href, filePath, id, folderScope)
        : { url: "#", inScope: true };

      // Out-of-scope .md links — render as muted text
      if (!inScope) {
        return (
          <span className="cursor-not-allowed text-zinc-500 dark:text-zinc-500" {...props}>
            {children}
          </span>
        );
      }

      const isInternal = url.startsWith("/s/");

      if (isInternal) {
        return (
          <Link href={url} {...props}>
            {children}
          </Link>
        );
      }

      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt, ...props }) => {
      let resolvedSrc = typeof src === "string" ? src : "";
      if (resolvedSrc && !resolvedSrc.startsWith("http")) {
        const currentDir = filePath.split("/").slice(0, -1).join("/");
        const imgPath = currentDir
          ? `${currentDir}/${resolvedSrc}`
          : resolvedSrc;
        resolvedSrc = `https://raw.githubusercontent.com/${owner}/${repo}/${share.branch}/${imgPath}`;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedSrc}
          alt={alt || ""}
          {...props}
          className="max-w-full rounded"
        />
      );
    },
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">markbase</span>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {share.repo}
          </span>
          {share.type === "folder" && share.file_path && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">/</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {share.file_path}
              </span>
            </>
          )}
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {share.branch}
          </span>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          shared
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        {showSidebar && (
          <SharedSidebar
            tree={tree}
            shareId={id}
            fileCount={sidebarFiles.length}
          />
        )}
        <main className="flex-1 overflow-y-auto">
          <div className="border-b border-zinc-200 px-8 py-3 dark:border-zinc-800">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {filePath}
            </span>
          </div>
          <div className="mx-auto w-full max-w-4xl px-8 py-8">
            <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:before:content-none prose-code:after:content-none">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={components}
              >
                {content}
              </Markdown>
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}

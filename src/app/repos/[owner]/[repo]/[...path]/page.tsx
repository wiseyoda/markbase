import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import {
  getDefaultBranch,
  getFileContent,
  getMarkdownTree,
} from "@/lib/github";
import "highlight.js/styles/github-dark.css";

function resolveRelativeLink(
  href: string,
  currentPath: string,
  owner: string,
  repo: string,
): string {
  if (
    href.startsWith("http") ||
    href.startsWith("#") ||
    href.startsWith("mailto:")
  ) {
    return href;
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
    return `/repos/${owner}/${repo}/${resolvedPath}`;
  }

  return href;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default async function MarkdownViewPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { owner, repo, path: pathSegments } = await params;
  const filePath = pathSegments.join("/");
  const branch = await getDefaultBranch(session.accessToken, owner, repo);

  const [content, files] = await Promise.all([
    getFileContent(session.accessToken, owner, repo, branch, filePath),
    getMarkdownTree(session.accessToken, owner, repo, branch),
  ]);

  if (content === null) {
    notFound();
  }

  // Compute prev/next files
  const allPaths = files.map((f) => f.path).sort();
  const currentIndex = allPaths.indexOf(filePath);
  const prevFile = currentIndex > 0 ? allPaths[currentIndex - 1] : null;
  const nextFile =
    currentIndex < allPaths.length - 1 ? allPaths[currentIndex + 1] : null;

  const fileSize = new Blob([content]).size;
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;

  const components: Components = {
    a: ({ href, children, ...props }) => {
      const resolved = href
        ? resolveRelativeLink(href, filePath, owner, repo)
        : "#";
      const isInternal = resolved.startsWith("/repos/");

      if (isInternal) {
        return (
          <Link href={resolved} {...props}>
            {children}
          </Link>
        );
      }

      return (
        <a
          href={resolved}
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
        resolvedSrc = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imgPath}`;
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
    <div className="flex flex-col">
      {/* Breadcrumb for current file */}
      <div className="border-b border-zinc-200 px-8 py-3 dark:border-zinc-800">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {filePath}
        </span>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-4xl px-8 py-8">
        <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-zinc-800 dark:prose-code:bg-zinc-800 dark:prose-code:text-zinc-200 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-950 dark:prose-strong:text-zinc-50 dark:prose-del:text-zinc-400">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={components}
          >
            {content}
          </Markdown>
        </article>

        {/* Footer metadata */}
        <div className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          <div className="flex items-center gap-2">
            <span>{branch}</span>
            <span>·</span>
            <span>{formatBytes(fileSize)}</span>
          </div>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Edit on GitHub
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z" />
            </svg>
          </a>
        </div>

        {/* Prev / Next navigation */}
        {(prevFile || nextFile) && (
          <div className="mt-4 flex items-stretch gap-4">
            {prevFile ? (
              <Link
                href={`/repos/${owner}/${repo}/${prevFile}`}
                className="flex flex-1 flex-col gap-1 rounded-lg border border-zinc-200 px-4 py-3 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  ← Previous
                </span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {prevFile.split("/").pop()}
                </span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
            {nextFile ? (
              <Link
                href={`/repos/${owner}/${repo}/${nextFile}`}
                className="flex flex-1 flex-col items-end gap-1 rounded-lg border border-zinc-200 px-4 py-3 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Next →
                </span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {nextFile.split("/").pop()}
                </span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

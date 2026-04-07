import { notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { getShare } from "@/lib/shares";
import { getFileContent } from "@/lib/github";
import "highlight.js/styles/github-dark.css";

function resolveShareLink(
  href: string,
  currentPath: string,
  shareId: string,
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
    return `/s/${shareId}/${resolvedPath}`;
  }

  return href;
}

export default async function SharedFilePage({
  params,
}: {
  params: Promise<{ id: string; path: string[] }>;
}) {
  const { id, path: pathSegments } = await params;
  const share = await getShare(id);

  if (!share || share.type !== "repo") notFound();

  const [owner, repo] = share.repo.split("/");
  const filePath = pathSegments.join("/");

  const content = await getFileContent(
    share.accessToken,
    owner,
    repo,
    share.branch,
    filePath,
  );

  if (!content) notFound();

  const components: Components = {
    a: ({ href, children, ...props }) => {
      const resolved = href
        ? resolveShareLink(href, filePath, id)
        : "#";
      const isInternal = resolved.startsWith("/s/");

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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/s/${id}`} className="font-semibold">
            markbase
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <Link
            href={`/s/${id}`}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {share.repo}
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-500 dark:text-zinc-400">{filePath}</span>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          shared
        </span>
      </header>
      <main className="mx-auto w-full max-w-4xl px-8 py-8">
        <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-zinc-800 dark:prose-code:bg-zinc-800 dark:prose-code:text-zinc-200 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-950 dark:prose-strong:text-zinc-50 dark:prose-del:text-zinc-400">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={components}
          >
            {content}
          </Markdown>
        </article>
      </main>
    </div>
  );
}

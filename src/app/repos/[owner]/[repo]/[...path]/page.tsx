import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { getDefaultBranch, getFileContent } from "@/lib/github";
import "highlight.js/styles/github-dark.css";

function resolveRelativeLink(
  href: string,
  currentPath: string,
  owner: string,
  repo: string,
): string {
  // Only rewrite relative .md links
  if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) {
    return href;
  }

  // Resolve relative path against current file's directory
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
  const content = await getFileContent(owner, repo, branch, filePath);

  if (content === null) {
    notFound();
  }

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
        <a href={resolved} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
    img: ({ src, alt, ...props }) => {
      // Resolve relative image paths to raw GitHub content
      let resolvedSrc = typeof src === "string" ? src : "";
      if (resolvedSrc && !resolvedSrc.startsWith("http")) {
        const currentDir = filePath.split("/").slice(0, -1).join("/");
        const imgPath = currentDir ? `${currentDir}/${resolvedSrc}` : resolvedSrc;
        resolvedSrc = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imgPath}`;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolvedSrc} alt={alt || ""} {...props} className="max-w-full rounded" />
      );
    },
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/repos" className="text-lg font-semibold">
          markbase
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <Link
          href={`/repos/${owner}/${repo}`}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {owner}/{repo}
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {filePath}
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        <article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-900 prose-pre:dark:bg-zinc-950">
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

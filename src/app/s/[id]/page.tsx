import { notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { getShare } from "@/lib/shares";
import { getFileContent, getMarkdownTree } from "@/lib/github";
import "highlight.js/styles/github-dark.css";

// For file shares: disable .md links (render as muted text)
function fileShareComponents(): Components {
  return {
    a: ({ href, children }) => {
      const isMdLink =
        href &&
        !href.startsWith("http") &&
        !href.startsWith("#") &&
        !href.startsWith("mailto:") &&
        href.endsWith(".md");

      if (isMdLink) {
        return (
          <span className="cursor-not-allowed text-zinc-500 dark:text-zinc-500">
            {children}
          </span>
        );
      }

      if (href?.startsWith("#")) {
        return <a href={href}>{children}</a>;
      }

      return (
        <a href={href || "#"} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await getShare(id);

  if (!share) notFound();

  const [owner, repo] = share.repo.split("/");

  // File share: render the single file
  if (share.type === "file" && share.file_path) {
    const content = await getFileContent(
      share.accessToken,
      owner,
      repo,
      share.branch,
      share.file_path,
    );

    if (!content) notFound();

    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">markbase</span>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {share.repo}
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {share.file_path}
            </span>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            shared
          </span>
        </header>
        <main className="mx-auto w-full max-w-4xl px-8 py-8">
          <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:before:content-none prose-code:after:content-none">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={fileShareComponents()}
            >
              {content}
            </Markdown>
          </article>
        </main>
      </div>
    );
  }

  // Repo or folder share: show file tree with links to browse
  if (share.type === "repo" || share.type === "folder") {
    let files = await getMarkdownTree(
      share.accessToken,
      owner,
      repo,
      share.branch,
    );

    // Filter to folder prefix for folder shares
    if (share.type === "folder" && share.file_path) {
      const prefix = share.file_path + "/";
      files = files.filter((f) => f.path.startsWith(prefix));
    }

    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">markbase</span>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {share.repo}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {share.branch}
            </span>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            shared
          </span>
        </header>
        <main className="mx-auto w-full max-w-3xl px-6 py-8">
          <div className="mb-4 text-sm text-zinc-400 dark:text-zinc-500">
            {files.length} markdown {files.length === 1 ? "file" : "files"}
          </div>
          <ul className="flex flex-col gap-1">
            {files
              .map((f) => f.path)
              .sort()
              .map((path) => (
                <li key={path}>
                  <Link
                    href={`/s/${id}/${path}`}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                    {path}
                  </Link>
                </li>
              ))}
          </ul>
        </main>
      </div>
    );
  }

  notFound();
}

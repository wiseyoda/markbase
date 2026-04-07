import { notFound, redirect } from "next/navigation";
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

  // Repo or folder share: redirect to first file (sidebar is in the [...path] page)
  if (share.type === "repo" || share.type === "folder") {
    let files = await getMarkdownTree(
      share.accessToken,
      owner,
      repo,
      share.branch,
    );

    if (share.type === "folder" && share.file_path) {
      const prefix = share.file_path + "/";
      files = files.filter((f) => f.path.startsWith(prefix));
    }

    const readme = files.find(
      (f) => f.path.toLowerCase().endsWith("readme.md"),
    );
    const target = readme || files[0];

    if (target) {
      redirect(`/s/${id}/${target.path}`);
    }

    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-400">
          No markdown files found.
        </p>
      </div>
    );
  }

  notFound();
}

import type { Metadata } from "next";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";
import { getShare } from "@/lib/shares";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return { title: "Shared file" };
  const name = share.file_path?.split("/").pop() || share.repo;
  return { title: `${name} — ${share.repo} (shared)` };
}
import { markdownSanitizeSchema } from "@/lib/markdown";
import { getFileContent, getMarkdownTree } from "@/lib/github";
import { buildTree } from "@/lib/tree";
import { refreshGitHubDocumentCache } from "@/lib/github-cache";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { GitHubRefreshButton } from "@/components/github-refresh-button";
import {
  SharedSidebar,
  SharedSidebarProvider,
  SharedSidebarToggle,
} from "./[...path]/shared-sidebar";
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

  const session = await auth();
  const isSignedIn = !!session?.user?.id;

  if (share.shared_with) {
    if (!isSignedIn || session.user.id !== share.shared_with) {
      notFound();
    }
  }

  const [owner, repo] = share.repo.split("/");

  // File share: render the single file
  if (share.type === "file" && share.file_path) {
    const refreshAction = async () => {
      "use server";

      const latestShare = await getShare(id);
      if (!latestShare || latestShare.type !== "file" || !latestShare.file_path) {
        notFound();
      }

      if (latestShare.shared_with) {
        const refreshSession = await auth();
        if (!refreshSession?.user?.id || refreshSession.user.id !== latestShare.shared_with) {
          notFound();
        }
      }

      refreshGitHubDocumentCache(
        owner,
        repo,
        latestShare.branch,
        latestShare.file_path,
      );
    };

    const content = await getFileContent(
      share.accessToken,
      owner,
      repo,
      share.branch,
      share.file_path,
    );

    if (content === null) notFound();

    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <Logo />
              markbase
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="truncate max-w-[250px] text-zinc-500 sm:max-w-none dark:text-zinc-400">
              {share.repo}
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="truncate max-w-[250px] text-zinc-500 sm:max-w-none dark:text-zinc-400">
              {share.file_path}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              shared
            </span>
            {isSignedIn && <GitHubRefreshButton action={refreshAction} />}
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
          <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:before:content-none prose-code:after:content-none">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[
                rehypeRaw,
                [rehypeSanitize, markdownSanitizeSchema],
                rehypeHighlight,
              ]}
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

    // Only auto-open README.md if it exists at the root of the shared scope
    const rootPrefix = share.type === "folder" && share.file_path
      ? share.file_path + "/"
      : "";
    const rootReadme = files.find((f) => {
      const name = f.path.slice(rootPrefix.length);
      return name.toLowerCase() === "readme.md";
    });

    if (rootReadme) {
      redirect(`/s/${id}/${encodeURI(rootReadme.path)}`);
    }

    if (files.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            No markdown files found.
          </p>
        </div>
      );
    }

    // No root README — show sidebar with "select a file" prompt
    const tree = buildTree(files);
    const folderLabel = share.type === "folder" && share.file_path
      ? share.file_path
      : share.repo;

    return (
      <SharedSidebarProvider>
        <div className="flex h-screen flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm">
              <SharedSidebarToggle />
              <span className="flex items-center gap-1.5 font-semibold">
                <Logo />
                markbase
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">/</span>
              <span className="truncate max-w-[200px] text-zinc-500 sm:max-w-none dark:text-zinc-400">
                {share.repo}
              </span>
              {share.type === "folder" && share.file_path && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600">/</span>
                  <span className="truncate max-w-[120px] text-zinc-500 sm:max-w-none dark:text-zinc-400">
                    {share.file_path}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                shared
              </span>
              <ThemeToggle />
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <SharedSidebar
              tree={tree}
              shareId={id}
              fileCount={files.length}
              commentCounts={{}}
            />
            <main className="flex flex-1 items-center justify-center bg-white dark:bg-zinc-950">
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <svg width="40" height="40" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-300 dark:text-zinc-700">
                  <path d="M1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H1.75zM9.5 1.854V4.25c0 .138.112.25.25.25h2.396L9.5 1.854zM0 1.75C0 .784.784 0 1.75 0h6.586c.464 0 .909.184 1.237.513l4.414 4.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.75 16H1.75A1.75 1.75 0 010 14.25V1.75z" />
                </svg>
                <p className="text-base font-medium text-zinc-600 dark:text-zinc-300">
                  {folderLabel}
                </p>
                <p className="max-w-xs text-sm text-zinc-400 dark:text-zinc-500">
                  Select a file from the sidebar to start reading.
                </p>
              </div>
            </main>
          </div>
        </div>
      </SharedSidebarProvider>
    );
  }

  notFound();
}

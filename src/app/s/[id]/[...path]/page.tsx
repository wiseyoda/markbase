import { notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { auth, signIn } from "@/auth";
import { getShare } from "@/lib/shares";
import { getFileContent, getMarkdownTree } from "@/lib/github";
import { buildTree } from "@/app/repos/[owner]/[repo]/layout";
import { githubRawUrl } from "@/lib/github-config";
import { resolveShareMarkdownLink } from "@/lib/markdown";
import {
  SharedSidebar,
  SharedSidebarProvider,
  SharedSidebarToggle,
} from "./shared-sidebar";
import {
  CommentRail,
  CommentProvider,
  CommentToggle,
} from "@/app/repos/[owner]/[repo]/[...path]/comment-rail";
import { HistoryButton } from "@/app/repos/[owner]/[repo]/[...path]/history-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { getComments, buildFileKey, countOpenComments } from "@/lib/comments";
import "highlight.js/styles/github-dark.css";

export default async function SharedFilePage({
  params,
}: {
  params: Promise<{ id: string; path: string[] }>;
}) {
  const { id, path: pathSegments } = await params;
  const session = await auth();
  const isSignedIn = !!session?.user?.id;
  const share = await getShare(id);

  if (!share || (share.type !== "repo" && share.type !== "folder")) notFound();

  // User-targeted shares require the correct user to be signed in
  if (share.shared_with) {
    if (!isSignedIn || session.user.id !== share.shared_with) {
      notFound();
    }
  }

  const [owner, repo] = share.repo.split("/");
  const filePath = pathSegments.join("/");

  // For folder shares, verify the path is within the shared folder
  if (share.type === "folder" && share.file_path) {
    if (!filePath.startsWith(share.file_path + "/")) {
      notFound();
    }
  }

  const fullRepo = `${owner}/${repo}`;
  const fKey = await buildFileKey(fullRepo, share.branch, filePath);
  const fileKeyPrefix = `${fullRepo}/${share.branch}/`;

  const [content, allFiles, initialComments, commentCounts] =
    await Promise.all([
      getFileContent(share.accessToken, owner, repo, share.branch, filePath),
      share.type === "repo" || share.type === "folder"
        ? getMarkdownTree(share.accessToken, owner, repo, share.branch)
        : Promise.resolve([]),
      isSignedIn ? getComments(fKey) : Promise.resolve([]),
      share.type === "repo" || share.type === "folder"
        ? countOpenComments(fileKeyPrefix)
        : Promise.resolve({}),
    ]);

  if (content === null) notFound();

  const folderScope = share.type === "folder" ? share.file_path : null;

  // Convert comment counts to path-based
  const pathCounts: Record<string, number> = {};
  for (const [key, val] of Object.entries(commentCounts)) {
    const path = key.slice(fileKeyPrefix.length);
    pathCounts[path] = (val as { count: number }).count;
  }

  // Build sidebar tree for repo/folder shares
  let sidebarFiles = allFiles;
  if (share.type === "folder" && share.file_path) {
    const prefix = share.file_path + "/";
    sidebarFiles = allFiles.filter((f) => f.path.startsWith(prefix));
  }
  const showSidebar =
    (share.type === "repo" || share.type === "folder") &&
    sidebarFiles.length > 0;
  const tree = showSidebar ? buildTree(sidebarFiles) : [];

  const unresolvedCount = initialComments.filter(
    (c) => !c.resolved_at,
  ).length;

  const components: Components = {
    a: ({ href, children, ...props }) => {
      const { url, inScope } = href
        ? resolveShareMarkdownLink(href, filePath, id, folderScope)
        : { url: "#", inScope: true };

      // Out-of-scope .md links -- render as muted text
      if (!inScope) {
        return (
          <span
            className="cursor-not-allowed text-zinc-500 dark:text-zinc-500"
            {...props}
          >
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
        <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
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
        resolvedSrc = githubRawUrl(owner, repo, share.branch, imgPath);
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
    <SharedSidebarProvider>
      <CommentProvider initialCount={isSignedIn ? unresolvedCount : 0}>
        <div className="flex h-screen flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm">
              {showSidebar && <SharedSidebarToggle />}
              <span className="font-semibold">markbase</span>
              <span className="text-zinc-300 dark:text-zinc-600">/</span>
              <span className="truncate max-w-[120px] text-zinc-500 sm:max-w-none dark:text-zinc-400">
                {share.repo}
              </span>
              {share.type === "folder" && share.file_path && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600">/</span>
                  <span className="truncate max-w-[100px] text-zinc-500 sm:max-w-none dark:text-zinc-400">
                    {share.file_path}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                shared
              </span>
              {!isSignedIn && (
                <form
                  action={async () => {
                    "use server";
                    await signIn("github", {
                      redirectTo: `/s/${id}/${pathSegments.join("/")}`,
                    });
                  }}
                >
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    <span className="hidden sm:inline">Sign in to comment</span>
                    <span className="sm:hidden">Sign in</span>
                  </button>
                </form>
              )}
              {isSignedIn && (
                <span className="hidden text-xs text-zinc-400 sm:inline dark:text-zinc-500">
                  {session.user?.name}
                </span>
              )}
              <ThemeToggle />
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            {showSidebar && (
              <SharedSidebar
                tree={tree}
                shareId={id}
                fileCount={sidebarFiles.length}
                commentCounts={pathCounts}
              />
            )}
            <main id="main-content" className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-950" data-scroll-container>
                <div className="flex flex-col gap-1 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-zinc-800">
                  <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {filePath}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    {isSignedIn && <CommentToggle />}
                    {isSignedIn && (
                      <HistoryButton
                        owner={owner}
                        repo={repo}
                        branch={share.branch}
                        filePath={filePath}
                        currentContent={content}
                        shareId={id}
                      />
                    )}
                  </div>
                </div>
                <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
                  <article
                    id="shared-markdown-content"
                    className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:before:content-none prose-code:after:content-none"
                  >
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={components}
                    >
                      {content}
                    </Markdown>
                  </article>
                  {!isSignedIn && (
                    <div className="mx-auto mt-8 max-w-md rounded-lg border border-dashed border-zinc-300 px-6 py-4 text-center dark:border-zinc-700">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Want to leave feedback?{" "}
                        <form className="inline" action={async () => {
                          "use server";
                          await signIn("github", {
                            redirectTo: `/s/${id}/${pathSegments.join("/")}`,
                          });
                        }}>
                          <button
                            type="submit"
                            className="font-medium text-zinc-900 underline hover:text-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-400"
                          >
                            Sign in with GitHub
                          </button>
                        </form>
                        {" "}to add inline comments.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {isSignedIn && (
                <CommentRail
                  repo={share.repo}
                  branch={share.branch}
                  filePath={filePath}
                  articleId="shared-markdown-content"
                  initialComments={initialComments}
                />
              )}
            </main>
          </div>
        </div>
      </CommentProvider>
    </SharedSidebarProvider>
  );
}

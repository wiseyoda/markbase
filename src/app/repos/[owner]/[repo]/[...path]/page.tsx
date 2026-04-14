import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}): Promise<Metadata> {
  const { owner, repo, path: segments } = await params;
  const fileName = segments[segments.length - 1];
  return { title: `${fileName} — ${owner}/${repo}` };
}
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import matter from "gray-matter";
import type { Components } from "react-markdown";
import {
  getDefaultBranch,
  getFileAtCommit,
  getFileContent,
  getFileHistory,
  getLastModified,
  getMarkdownTree,
} from "@/lib/github";
import { refreshGitHubDocumentCache } from "@/lib/github-cache";
import { CopyButton } from "./copy-button";
import { CommentRail, CommentProvider, CommentToggle } from "./comment-rail";
import { HistoryButton } from "./history-panel";
import { relativeTime, formatBytes, readingTime } from "@/lib/format";
import {
  extractToc,
  markdownSanitizeSchema,
  resolveRelativeMarkdownLink,
  slugifyHeading,
} from "@/lib/markdown";
import { githubRawUrl } from "@/lib/github-config";
import { getComments, buildFileKey } from "@/lib/comments";
import { withDbRetry } from "@/lib/db";
import { GitHubRefreshButton } from "@/components/github-refresh-button";
import { TldrCallout } from "@/components/tldr-callout";
import { ChangeDigestBanner } from "@/components/change-digest-banner";
import { computeBlobSha, getFileSummary } from "@/lib/file-summaries";
import { computeViewInsights } from "@/lib/view-insights";
import "highlight.js/styles/github-dark.css";

export default async function MarkdownViewPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { owner, repo, path: pathSegments } = await params;
  const filePath = pathSegments.map(decodeURIComponent).join("/");
  const branch = await getDefaultBranch(session.accessToken, owner, repo);

  const fullRepo = `${owner}/${repo}`;
  const fKey = await buildFileKey(fullRepo, branch, filePath);

  // Round 1: fetch history (uncached, so we always see new commits),
  // the tree, comments, and last-modified in parallel. Content is
  // deliberately NOT in this batch — we need the latest commit sha from
  // history first so we can fetch the content at an immutable commit URL.
  const [history, files, initialComments, lastModified] = await Promise.all([
    getFileHistory(session.accessToken, owner, repo, branch, filePath),
    getMarkdownTree(session.accessToken, owner, repo, branch),
    withDbRetry(() => getComments(fKey)),
    getLastModified(session.accessToken, owner, repo, branch, filePath),
  ]);

  // Round 2: fetch content at the commit-scoped URL so Next can cache it
  // eternally per sha. When the user pushes a new commit, history returns
  // the new sha and the fetch miss triggers a fresh fetch; the old blob
  // stays in cache but is never read again. On a brand-new file with no
  // history yet, fall back to the branch-ref contents endpoint.
  const latestCommitSha = history[0]?.sha ?? null;
  const rawContent = latestCommitSha
    ? await getFileAtCommit(
        session.accessToken,
        owner,
        repo,
        latestCommitSha,
        filePath,
      )
    : await getFileContent(session.accessToken, owner, repo, branch, filePath);

  if (rawContent === null) {
    notFound();
  }

  // Prefer the tree-provided blob sha (authoritative) and fall back to a
  // locally-computed one if the file is somehow absent from the tree (e.g. a
  // newly pushed file not yet reflected in the cached tree).
  const treeEntry = files.find((f) => f.path === filePath);
  const blobSha = treeEntry?.sha ?? computeBlobSha(rawContent);

  // Phase 1: cached TL;DR summary (read-only, fast). Generation happens
  // lazily via /api/summary when the client component mounts. Failures
  // (missing migration, transient DB error) must never break the page —
  // the client will try again through the API route.
  const cachedSummary = await withDbRetry(() =>
    getFileSummary({ owner, repo, filePath, blobSha }),
  ).catch(() => null);

  // Parse frontmatter first so we have the post-frontmatter content to pass
  // to both computeViewInsights (for the line-diff) and react-markdown.
  let frontmatter: Record<string, unknown> = {};
  let content = rawContent;
  try {
    const parsed = matter(rawContent);
    frontmatter = parsed.data;
    content = parsed.content;
  } catch {
    // Malformed frontmatter (e.g. duplicate keys) — render as plain markdown
  }
  const hasFrontmatter = Object.keys(frontmatter).length > 0;

  // Everything the viewer needs to mark "what's new for this user" in one
  // call. Pure function, returns empty state on any error, runs in parallel
  // with nothing else (no point — it needs `content` which we just parsed).
  const insights = await computeViewInsights({
    accessToken: session.accessToken,
    userId: session.user?.id ?? null,
    owner,
    repo,
    branch,
    filePath,
    currentContent: content,
    currentRawContent: rawContent,
    currentBlobSha: blobSha,
  });
  const {
    currentCommitSha,
    previousCommitSha: previousCommitShaForDigest,
    changedSectionSlugs,
    newSectionSlugs,
    textChangedLines,
  } = insights;

  const lineRangeChanged = (
    start: number | undefined,
    end: number | undefined,
  ): boolean => {
    if (textChangedLines.size === 0) return false;
    if (start === undefined || end === undefined) return false;
    for (let line = start; line <= end; line++) {
      if (textChangedLines.has(line)) return true;
    }
    return false;
  };

  // Extract TOC
  const toc = extractToc(content);
  const hasToc = toc.length > 2;

  // Compute prev/next files
  const allPaths = files.map((f) => f.path).sort();
  const currentIndex = allPaths.indexOf(filePath);
  const prevFile = currentIndex > 0 ? allPaths[currentIndex - 1] : null;
  const nextFile =
    currentIndex < allPaths.length - 1 ? allPaths[currentIndex + 1] : null;

  const fileSize = new Blob([rawContent]).size;
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;

  const headingClass = (slug: string): string | undefined => {
    if (newSectionSlugs.has(slug)) {
      return "markbase-section-new";
    }
    if (changedSectionSlugs.has(slug)) {
      return "markbase-section-changed";
    }
    return undefined;
  };

  const components: Components = {
    a: ({ href, children, ...props }) => {
      const resolved = href
        ? resolveRelativeMarkdownLink(href, filePath, owner, repo)
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
      if (!resolvedSrc) return null;
      if (resolvedSrc && !resolvedSrc.startsWith("http")) {
        const currentDir = filePath.split("/").slice(0, -1).join("/");
        const imgPath = currentDir
          ? `${currentDir}/${resolvedSrc}`
          : resolvedSrc;
        resolvedSrc = githubRawUrl(owner, repo, branch, imgPath);
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
    pre: ({ node, children, ...props }) => {
      // Extract text content for the copy button
      let codeText = "";
      const extractText = (n: React.ReactNode): void => {
        if (typeof n === "string") {
          codeText += n;
        } else if (Array.isArray(n)) {
          n.forEach(extractText);
        } else if (n && typeof n === "object" && "props" in n) {
          const reactNode = n as React.ReactElement<{ children?: React.ReactNode }>;
          if (reactNode.props?.children) {
            extractText(reactNode.props.children);
          }
        }
      };
      extractText(children);

      const changed = lineRangeChanged(
        node?.position?.start.line,
        node?.position?.end.line,
      );

      return (
        <div className="group relative" data-change={changed ? "text-changed" : undefined}>
          <CopyButton text={codeText.trim()} />
          <pre {...props}>{children}</pre>
        </div>
      );
    },
    p: ({ node, children, ...props }) => {
      const changed = lineRangeChanged(
        node?.position?.start.line,
        node?.position?.end.line,
      );
      return (
        <p data-change={changed ? "text-changed" : undefined} {...props}>
          {children}
        </p>
      );
    },
    li: ({ node, children, ...props }) => {
      const changed = lineRangeChanged(
        node?.position?.start.line,
        node?.position?.end.line,
      );
      return (
        <li data-change={changed ? "text-changed" : undefined} {...props}>
          {children}
        </li>
      );
    },
    blockquote: ({ node, children, ...props }) => {
      const changed = lineRangeChanged(
        node?.position?.start.line,
        node?.position?.end.line,
      );
      return (
        <blockquote data-change={changed ? "text-changed" : undefined} {...props}>
          {children}
        </blockquote>
      );
    },
    h1: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = slugifyHeading(text);
      return <h1 id={id} data-change={headingClass(id)} {...props}>{children}</h1>;
    },
    h2: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = slugifyHeading(text);
      return <h2 id={id} data-change={headingClass(id)} {...props}>{children}</h2>;
    },
    h3: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = slugifyHeading(text);
      return <h3 id={id} data-change={headingClass(id)} {...props}>{children}</h3>;
    },
    h4: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = slugifyHeading(text);
      return <h4 id={id} {...props}>{children}</h4>;
    },
  };

  const unresolvedCount = initialComments.filter(
    (c) => !c.resolved_at,
  ).length;

  const refreshAction = async () => {
    "use server";

    const refreshSession = await auth();
    if (!refreshSession?.accessToken) redirect("/");

    refreshGitHubDocumentCache(owner, repo, branch, filePath);
  };

  return (
    <CommentProvider initialCount={unresolvedCount}>
      <div id="main-content" className="flex h-full">
        <div className="flex flex-1 flex-col overflow-y-auto bg-white dark:bg-zinc-950" data-scroll-container>
          {/* Content */}
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-8 py-6 sm:py-8">
            {/* File metadata + document actions — inline, not a separate bar */}
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-400 dark:text-zinc-500">
                <span className="truncate">{filePath}</span>
                {lastModified && <span>· updated {relativeTime(lastModified)}</span>}
                <span>· {readingTime(content)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <GitHubRefreshButton action={refreshAction} />
                <CommentToggle />
                <HistoryButton
                  owner={owner}
                  repo={repo}
                  branch={branch}
                  filePath={filePath}
                  currentContent={content}
                />
              </div>
            </div>
            {/* Frontmatter */}
            {hasFrontmatter && (
              <details className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                  Frontmatter
                </summary>
                <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {Object.entries(frontmatter).map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {key}
                        </dt>
                        <dd className="text-zinc-600 dark:text-zinc-300">
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </details>
            )}

            {/* Table of Contents */}
            {hasToc && (
              <details className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                  Table of contents
                </summary>
                <nav className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <ul className="flex flex-col gap-1">
                    {toc.map((entry, i) => (
                      <li
                        key={`${entry.slug}-${i}`}
                        style={{ paddingLeft: `${(entry.level - 1) * 1}rem` }}
                      >
                        <a
                          href={`#${entry.slug}`}
                          className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                        >
                          {entry.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </details>
            )}

            {/* AI summary — keyed on path so navigation always remounts with
                fresh fetch state; prevents cross-file leakage even if React
                reuses the instance. */}
            <TldrCallout
              key={`tldr:${owner}/${repo}/${filePath}`}
              owner={owner}
              repo={repo}
              filePath={filePath}
              initialSummary={cachedSummary?.summary ?? null}
            />

            {/* Change digest — lazily fetched on mount so it never blocks SSR.
                Keyed on (path + commit) so a new commit landing on the same
                file during the session also forces a clean remount. */}
            {currentCommitSha && (
              <ChangeDigestBanner
                key={`digest:${owner}/${repo}/${filePath}:${currentCommitSha}`}
                owner={owner}
                repo={repo}
                filePath={filePath}
                fromCommitSha={previousCommitShaForDigest}
                toCommitSha={currentCommitSha}
                currentBlobSha={blobSha}
              />
            )}

            {/* Markdown */}
            <article id="markdown-content" className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:before:content-none prose-code:after:content-none">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                  rehypeRaw,
                  [rehypeSanitize, markdownSanitizeSchema],
                  rehypeHighlight,
                ]}
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
              <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-4">
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
        <CommentRail
          repo={fullRepo}
          branch={branch}
          filePath={filePath}
          articleId="markdown-content"
          initialComments={initialComments}
        />
      </div>
    </CommentProvider>
  );
}

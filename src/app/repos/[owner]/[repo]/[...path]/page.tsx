import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import matter from "gray-matter";
import type { Components } from "react-markdown";
import {
  getDefaultBranch,
  getFileContent,
  getMarkdownTree,
} from "@/lib/github";
import { CopyButton } from "./copy-button";
import { CommentRail } from "./comment-rail";
import { getComments, buildFileKey } from "@/lib/comments";
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

interface TocEntry {
  level: number;
  text: string;
  slug: string;
}

function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*_`~\[\]]/g, "");
      const slug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      entries.push({ level, text, slug });
    }
  }

  return entries;
}

function readingTime(text: string): string {
  const words = text.split(/\s+/).length;
  const minutes = Math.ceil(words / 230);
  return `${minutes} min read`;
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

  const fullRepo = `${owner}/${repo}`;
  const fKey = await buildFileKey(fullRepo, branch, filePath);

  const [rawContent, files, initialComments] = await Promise.all([
    getFileContent(session.accessToken, owner, repo, branch, filePath),
    getMarkdownTree(session.accessToken, owner, repo, branch),
    getComments(fKey),
  ]);

  if (rawContent === null) {
    notFound();
  }

  // Parse frontmatter
  const { data: frontmatter, content } = matter(rawContent);
  const hasFrontmatter = Object.keys(frontmatter).length > 0;

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
    pre: ({ children, ...props }) => {
      // Extract text content for the copy button
      let codeText = "";
      const extractText = (node: React.ReactNode): void => {
        if (typeof node === "string") {
          codeText += node;
        } else if (Array.isArray(node)) {
          node.forEach(extractText);
        } else if (node && typeof node === "object" && "props" in node) {
          const reactNode = node as React.ReactElement<{ children?: React.ReactNode }>;
          if (reactNode.props?.children) {
            extractText(reactNode.props.children);
          }
        }
      };
      extractText(children);

      return (
        <div className="group relative">
          <CopyButton text={codeText.trim()} />
          <pre {...props}>{children}</pre>
        </div>
      );
    },
    h1: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      return <h1 id={id} {...props}>{children}</h1>;
    },
    h2: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      return <h2 id={id} {...props}>{children}</h2>;
    },
    h3: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      return <h3 id={id} {...props}>{children}</h3>;
    },
    h4: ({ children, ...props }) => {
      const text = String(children).replace(/[*_`~\[\]]/g, "");
      const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      return <h4 id={id} {...props}>{children}</h4>;
    },
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-y-auto" data-scroll-container>
      {/* Breadcrumb + reading time */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-8 py-3 dark:border-zinc-800">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {filePath}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {readingTime(content)}
        </span>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-4xl px-8 py-8">
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

        {/* Markdown */}
        <article id="markdown-content" className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-code:before:content-none prose-code:after:content-none">
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
      <CommentRail
        repo={fullRepo}
        branch={branch}
        filePath={filePath}
        articleId="markdown-content"
        initialComments={initialComments}
      />
    </div>
  );
}

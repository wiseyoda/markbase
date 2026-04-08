import { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeOptions } from "rehype-sanitize";

/**
 * GitHub-compatible HTML sanitization schema for react-markdown.
 * Allows safe HTML tags (div, img, a, br, etc.) while blocking XSS vectors.
 */
export const markdownSanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span || []),
      ["className", /^hljs/],
    ],
  },
};

export interface TocEntry {
  level: number;
  text: string;
  slug: string;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function resolveRelativeMarkdownLink(
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

export function resolveShareMarkdownLink(
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
    if (folderScope && !resolvedPath.startsWith(`${folderScope}/`)) {
      return { url: resolvedPath, inScope: false };
    }
    return { url: `/s/${shareId}/${resolvedPath}`, inScope: true };
  }

  return { url: href, inScope: true };
}

export function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (!match) continue;

    const text = match[2].replace(/[*_`~\[\]]/g, "");
    entries.push({
      level: match[1].length,
      text,
      slug: slugifyHeading(text),
    });
  }

  return entries;
}

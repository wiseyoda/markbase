import type { Comment } from "@/lib/comments";

export interface SelectionPopupState {
  x: number;
  y: number;
  text: string;
  context: string;
  offset: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
    }
  }

  throw new Error("unreachable");
}

export function clearCommentHighlights(root: HTMLElement): void {
  root.querySelectorAll(".comment-highlight").forEach((element) => {
    const parent = element.parentNode;
    if (!parent) return;
    parent.replaceChild(
      document.createTextNode(element.textContent || ""),
      element,
    );
    parent.normalize();
  });
}

export function getTextOffset(root: HTMLElement, range: Range): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === range.startContainer) {
      return offset + range.startOffset;
    }
    offset += (node.textContent || "").length;
  }

  return offset;
}

export function highlightText(
  root: HTMLElement,
  text: string,
  commentId: string,
  offsetHint?: number,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  let accumulated = "";
  const nodeMap: { node: Text; start: number; end: number }[] = [];

  for (const node of textNodes) {
    const content = node.textContent || "";
    nodeMap.push({
      node,
      start: accumulated.length,
      end: accumulated.length + content.length,
    });
    accumulated += content;
  }

  let matchStart = -1;
  let matchLength = text.length;

  if (offsetHint !== undefined) {
    const searchFrom = Math.max(0, offsetHint - 20);
    const nearbyMatch = accumulated.indexOf(text, searchFrom);
    if (nearbyMatch !== -1 && Math.abs(nearbyMatch - offsetHint) < 200) {
      matchStart = nearbyMatch;
    }
  }

  if (matchStart === -1) {
    matchStart = accumulated.indexOf(text);
  }

  if (matchStart === -1) {
    const stripped = text.replace(/[\n\t\r]/g, "");
    if (stripped !== text) {
      matchLength = stripped.length;

      if (offsetHint !== undefined) {
        const searchFrom = Math.max(0, offsetHint - 20);
        const nearbyMatch = accumulated.indexOf(stripped, searchFrom);
        if (nearbyMatch !== -1 && Math.abs(nearbyMatch - offsetHint) < 200) {
          matchStart = nearbyMatch;
        }
      }

      if (matchStart === -1) {
        matchStart = accumulated.indexOf(stripped);
      }
    }
  }

  if (matchStart === -1) return;

  const matchEnd = matchStart + matchLength;

  for (const { node, start, end } of nodeMap) {
    if (end <= matchStart || start >= matchEnd) continue;

    const nodeStart = Math.max(0, matchStart - start);
    const nodeEnd = Math.min(node.textContent?.length || 0, matchEnd - start);
    const range = document.createRange();
    range.setStart(node, nodeStart);
    range.setEnd(node, nodeEnd);

    const highlight = document.createElement("mark");
    highlight.className =
      "comment-highlight bg-yellow-200/30 dark:bg-yellow-500/20 cursor-pointer rounded-sm";
    highlight.dataset.commentId = commentId;

    try {
      range.surroundContents(highlight);
    } catch {
      // Ignore ranges that cross DOM boundaries.
    }
  }
}

export function buildSelectionPopupState(
  article: HTMLElement,
  selection: Selection,
  clientX: number,
  clientY: number,
): SelectionPopupState | null {
  if (selection.isCollapsed) return null;

  const text = selection.toString().trim();
  if (!text || text.length < 3) return null;

  const range = selection.getRangeAt(0);
  if (!article.contains(range.commonAncestorContainer)) return null;

  const offset = getTextOffset(article, range);
  const fullText = article.textContent || "";
  const start = Math.max(0, offset - 40);
  const end = Math.min(fullText.length, offset + text.length + 40);

  return {
    x: clientX,
    y: clientY - 40,
    text,
    context: fullText.slice(start, end),
    offset,
  };
}

export function calculateCommentPositions(
  article: HTMLElement,
  scrollContainer: HTMLElement,
  comments: Comment[],
): Record<string, number> {
  let articleOffset = 0;
  let current: HTMLElement | null = article;

  while (current && current !== scrollContainer) {
    articleOffset += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }

  const positions: Record<string, number> = {};

  for (const comment of comments) {
    if (!comment.quote) continue;
    const highlight = article.querySelector(
      `[data-comment-id="${comment.id}"]`,
    ) as HTMLElement | null;

    if (!highlight) continue;

    let offset = 0;
    let element: HTMLElement | null = highlight;

    while (element && element !== article) {
      offset += element.offsetTop;
      element = element.offsetParent as HTMLElement | null;
    }

    positions[comment.id] = articleOffset + offset;
  }

  return positions;
}

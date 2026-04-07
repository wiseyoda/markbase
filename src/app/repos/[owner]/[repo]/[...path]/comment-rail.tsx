"use client";

import {
  useState,
  useEffect,
  useRef,
  useTransition,
  useCallback,
} from "react";
import {
  addComment,
  fetchComments,
  resolveCommentAction,
  unresolveCommentAction,
  deleteCommentAction,
} from "./comment-actions";
import type { Comment } from "@/lib/comments";

interface CommentRailProps {
  repo: string;
  branch: string;
  filePath: string;
  articleId: string;
  initialComments?: Comment[];
}

export function CommentRail({
  repo,
  branch,
  filePath,
  articleId,
  initialComments,
}: CommentRailProps) {
  const [open, setOpen] = useState(true);
  const [comments, setComments] = useState<Comment[]>(initialComments || []);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{
    x: number;
    y: number;
    text: string;
    context: string;
  } | null>(null);

  const loadComments = useCallback(async () => {
    const data = await fetchComments(repo, branch, filePath);
    setComments(data);
  }, [repo, branch, filePath]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    fetchComments(repo, branch, filePath).then((data) => {
      if (!cancelled) setComments(data);
    });
    return () => { cancelled = true; };
  }, [repo, branch, filePath]);

  // Highlight commented text in the article
  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    // Clear existing highlights
    article.querySelectorAll(".comment-highlight").forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(
          document.createTextNode(el.textContent || ""),
          el,
        );
        parent.normalize();
      }
    });

    // Add highlights for each quoted comment
    const quotes = comments
      .filter((c) => c.quote && !c.resolved_at)
      .map((c) => ({ id: c.id, quote: c.quote! }));

    for (const { id, quote } of quotes) {
      highlightText(article, quote, id);
    }
  }, [comments, articleId]);

  // Listen for text selection in the article
  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    const handleMouseUp = (e: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionPopup(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text || text.length < 3) {
        setSelectionPopup(null);
        return;
      }

      // Check if selection is within the article
      const range = selection.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) {
        setSelectionPopup(null);
        return;
      }

      // Get surrounding context
      const fullText = article.textContent || "";
      const idx = fullText.indexOf(text);
      const start = Math.max(0, idx - 40);
      const end = Math.min(fullText.length, idx + text.length + 40);
      const context = fullText.slice(start, end);

      setSelectionPopup({
        x: e.clientX,
        y: e.clientY - 40,
        text,
        context,
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text || text.length < 3) return;

      const range = selection.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) return;

      e.preventDefault();

      const fullText = article.textContent || "";
      const idx = fullText.indexOf(text);
      const start = Math.max(0, idx - 40);
      const end = Math.min(fullText.length, idx + text.length + 40);
      const context = fullText.slice(start, end);

      setSelectionPopup({
        x: e.clientX,
        y: e.clientY - 40,
        text,
        context,
      });
    };

    article.addEventListener("mouseup", handleMouseUp);
    article.addEventListener("contextmenu", handleContextMenu);
    return () => {
      article.removeEventListener("mouseup", handleMouseUp);
      article.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [articleId]);

  const unresolved = comments.filter((c) => !c.resolved_at);
  const resolved = comments.filter((c) => c.resolved_at);

  // Calculate absolute Y positions of highlights in the content scroll container
  const [positions, setPositions] = useState<Record<string, number>>({});
  const railRef = useRef<HTMLDivElement>(null);

  const updatePositions = useCallback(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    const newPositions: Record<string, number> = {};
    for (const comment of unresolved) {
      if (!comment.quote) continue;
      const highlight = article.querySelector(
        `[data-comment-id="${comment.id}"]`,
      ) as HTMLElement | null;
      if (highlight) {
        // Get the highlight's offset from top of the article
        let offset = 0;
        let el: HTMLElement | null = highlight;
        while (el && el !== article) {
          offset += el.offsetTop;
          el = el.offsetParent as HTMLElement | null;
        }
        newPositions[comment.id] = offset;
      }
    }
    setPositions(newPositions);
  }, [unresolved, articleId]);

  useEffect(() => {
    const raf = requestAnimationFrame(updatePositions);
    window.addEventListener("resize", updatePositions);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePositions);
    };
  }, [updatePositions]);

  // Scroll sync: when content scrolls, set rail scrollTop to match
  useEffect(() => {
    const scrollContainer = document.querySelector("[data-scroll-container]") as HTMLElement | null;
    const rail = railRef.current;
    if (!scrollContainer || !rail) return;

    const handleScroll = () => {
      rail.scrollTop = scrollContainer.scrollTop;
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [comments]);

  const anchored = unresolved.filter((c) => positions[c.id] !== undefined);
  const orphaned = unresolved.filter(
    (c) => c.quote && positions[c.id] === undefined,
  );
  const noQuote = unresolved.filter((c) => !c.quote);

  return (
    <>
      {/* Selection popup */}
      {selectionPopup && (
        <SelectionPopup
          x={selectionPopup.x}
          y={selectionPopup.y}
          onComment={() => {
            setActiveQuote(selectionPopup.text);
            setOpen(true);
            setSelectionPopup(null);
          }}
          onClose={() => setSelectionPopup(null)}
        />
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed right-4 bottom-4 z-30 flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg md:hidden dark:bg-zinc-100 dark:text-zinc-900"
      >
        {unresolved.length > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
            {unresolved.length}
          </span>
        )}
        Comments
      </button>

      {/* Right rail */}
      <aside
        className={`${
          open ? "w-80" : "w-0"
        } shrink-0 overflow-hidden border-l border-zinc-200 transition-all dark:border-zinc-800`}
      >
        <div className="flex h-full w-80 flex-col">
          {/* Rail header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Comments</span>
              {unresolved.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs text-white">
                  {unresolved.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              &times;
            </button>
          </div>

          {/* New comment from selection */}
          {activeQuote && (
            <NewCommentForm
              quote={activeQuote}
              quoteContext=""
              repo={repo}
              branch={branch}
              filePath={filePath}
              parentId={null}
              onSubmit={() => {
                setActiveQuote(null);
                loadComments();
              }}
              onCancel={() => setActiveQuote(null)}
            />
          )}

          {/* Comment list — scrollTop synced with content */}
          <div ref={railRef} className="relative flex-1 overflow-y-auto">
            {unresolved.length === 0 && !activeQuote && (
              <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
                Select text to add a comment.
              </div>
            )}

            {/* Positioned comments container — same height as content */}
            {anchored.length > 0 && (
              <div className="relative" style={{ minHeight: Math.max(0, ...Object.values(positions)) + 200 }}>
                {(() => {
                  const sorted = [...anchored].sort(
                    (a, b) => (positions[a.id] || 0) - (positions[b.id] || 0),
                  );
                  let lastBottom = 0;
                  const MIN_GAP = 8;

                  return sorted.map((comment) => {
                    const idealTop = positions[comment.id] || 0;
                    const top = Math.max(idealTop, lastBottom + MIN_GAP);
                    lastBottom = top + 120;

                    return (
                      <div
                        key={comment.id}
                        className="absolute left-0 right-0"
                        style={{ top }}
                      >
                        <CommentThread
                          comment={comment}
                          repo={repo}
                          branch={branch}
                          filePath={filePath}
                          onUpdate={loadComments}
                        />
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Unanchored comments */}
            {noQuote.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                repo={repo}
                branch={branch}
                filePath={filePath}
                onUpdate={loadComments}
              />
            ))}

            {/* Orphaned comments */}
            {orphaned.length > 0 && (
              <details className="border-t border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer px-4 py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500">
                  {orphaned.length} on changed text
                </summary>
                {orphaned.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    repo={repo}
                    branch={branch}
                    filePath={filePath}
                    onUpdate={loadComments}
                  />
                ))}
              </details>
            )}

            {/* Resolved */}
            {resolved.length > 0 && (
              <details
                className="border-t border-zinc-200 dark:border-zinc-800"
                open={showResolved}
                onToggle={(e) =>
                  setShowResolved((e.target as HTMLDetailsElement).open)
                }
              >
                <summary className="cursor-pointer px-4 py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500">
                  {resolved.length} resolved
                </summary>
                {resolved.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    repo={repo}
                    branch={branch}
                    filePath={filePath}
                    onUpdate={loadComments}
                  />
                ))}
              </details>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function SelectionPopup({
  x,
  y,
  onComment,
  onClose,
}: {
  x: number;
  y: number;
  onComment: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Delay to avoid capturing the mouseup that created this
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handler),
      100,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] rounded-md border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: x - 40, top: y }}
    >
      <button
        onClick={onComment}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
        </svg>
        Comment
      </button>
    </div>
  );
}

function CommentThread({
  comment,
  repo,
  branch,
  filePath,
  onUpdate,
}: {
  comment: Comment;
  repo: string;
  branch: string;
  filePath: string;
  onUpdate: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleResolve = () => {
    startTransition(async () => {
      if (comment.resolved_at) {
        await unresolveCommentAction(comment.id);
      } else {
        await resolveCommentAction(comment.id);
      }
      onUpdate();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const repoOwner = repo.split("/")[0];
      await deleteCommentAction(comment.id, repoOwner);
      onUpdate();
    });
  };

  return (
    <div
      className={`border-b border-zinc-100 px-4 py-3 dark:border-zinc-800/50 ${
        comment.resolved_at ? "opacity-60" : ""
      }`}
    >
      {/* Quote */}
      {comment.quote && (
        <div className="mb-2 border-l-2 border-blue-400 pl-2 text-xs text-zinc-400 dark:text-zinc-500">
          &ldquo;{comment.quote.length > 80
            ? comment.quote.slice(0, 80) + "..."
            : comment.quote}&rdquo;
        </div>
      )}

      {/* Comment body */}
      <div className="flex gap-2">
        {comment.author_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.author_avatar}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full"
          />
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium dark:bg-zinc-700">
            {comment.author_name[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">
              {comment.author_name}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {timeAgo(comment.created_at)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
            {comment.body}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setShowReply(!showReply)}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Reply
        </button>
        <button
          onClick={handleResolve}
          disabled={isPending}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {comment.resolved_at ? "Reopen" : "Resolve"}
        </button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 mt-2 flex flex-col gap-2 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              {reply.author_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reply.author_avatar}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full"
                />
              ) : (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs dark:bg-zinc-700">
                  {reply.author_name[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {reply.author_name}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {timeAgo(reply.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                  {reply.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {showReply && (
        <div className="ml-8 mt-2">
          <NewCommentForm
            quote={null}
            quoteContext={null}
            repo={repo}
            branch={branch}
            filePath={filePath}
            parentId={comment.id}
            onSubmit={() => {
              setShowReply(false);
              onUpdate();
            }}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}
    </div>
  );
}

function NewCommentForm({
  quote,
  quoteContext,
  repo,
  branch,
  filePath,
  parentId,
  onSubmit,
  onCancel,
}: {
  quote: string | null;
  quoteContext: string | null;
  repo: string;
  branch: string;
  filePath: string;
  parentId: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!body.trim()) return;
    startTransition(async () => {
      await addComment({
        repo,
        branch,
        filePath,
        quote,
        quoteContext,
        body: body.trim(),
        parentId,
      });
      setBody("");
      onSubmit();
    });
  };

  return (
    <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      {quote && (
        <div className="mb-2 border-l-2 border-blue-400 pl-2 text-xs text-zinc-400 dark:text-zinc-500">
          &ldquo;{quote.length > 100 ? quote.slice(0, 100) + "..." : quote}
          &rdquo;
        </div>
      )}
      <textarea
        ref={inputRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={parentId ? "Reply..." : "Add a comment..."}
        className="w-full resize-none rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-zinc-700"
        rows={2}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {"\u2318"}+Enter to submit
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !body.trim()}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {isPending ? "..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Find and highlight text in an article element */
function highlightText(root: HTMLElement, text: string, commentId: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  // Build concatenated text with node boundaries
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

  const matchStart = accumulated.indexOf(text);
  if (matchStart === -1) return;
  const matchEnd = matchStart + text.length;

  // Find nodes that overlap with the match
  for (const { node, start, end } of nodeMap) {
    if (end <= matchStart || start >= matchEnd) continue;

    const nodeStart = Math.max(0, matchStart - start);
    const nodeEnd = Math.min(node.textContent!.length, matchEnd - start);

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
      // Can't surround if range crosses element boundaries
    }
  }
}

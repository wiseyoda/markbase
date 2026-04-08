"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useTransition,
  useCallback,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import {
  addComment,
  fetchComments,
  resolveCommentAction,
  unresolveCommentAction,
  deleteCommentAction,
  restoreCommentAction,
} from "./comment-actions";
import type { Comment } from "@/lib/comments";
import { relativeTime } from "@/lib/format";
import { useIsDesktop } from "@/hooks/use-media-query";
import {
  buildSelectionPopupState,
  calculateCommentPositions,
  clearCommentHighlights,
  highlightText,
  withRetry,
} from "@/lib/comment-dom";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Tooltip } from "@/components/tooltip";

/* ------------------------------------------------------------------ */
/* Context: shared open/close state between CommentToggle and Rail    */
/* ------------------------------------------------------------------ */

interface CommentContextValue {
  open: boolean;
  setOpen: (o: boolean) => void;
  count: number;
  setCount: (n: number) => void;
}

const CommentContext = createContext<CommentContextValue>({
  open: true,
  setOpen: () => {},
  count: 0,
  setCount: () => {},
});

function subscribeCommentsStorage(cb: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === "markbase-comments") cb();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getCommentsSnapshot(): boolean | null {
  const stored = sessionStorage.getItem("markbase-comments");
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return null; // no stored preference
}

export function CommentProvider({
  children,
  initialCount,
}: {
  children: React.ReactNode;
  initialCount: number;
}) {
  const storedPref = useSyncExternalStore(
    subscribeCommentsStorage,
    getCommentsSnapshot,
    () => null,
  );
  // Use stored preference if set, otherwise open when there are comments
  const open = storedPref ?? initialCount > 0;
  const [count, setCount] = useState(initialCount);

  const setOpen = useCallback((v: boolean) => {
    sessionStorage.setItem("markbase-comments", v ? "open" : "closed");
    window.dispatchEvent(new StorageEvent("storage", { key: "markbase-comments" }));
  }, []);

  return (
    <CommentContext.Provider value={{ open, setOpen, count, setCount }}>
      {children}
    </CommentContext.Provider>
  );
}

export function CommentToggle() {
  const { open, setOpen, count } = useContext(CommentContext);
  return (
    <Tooltip content={open ? "Hide comments" : "Show comments"}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="text-zinc-500 dark:text-zinc-400"
        >
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
        </svg>
        Comments
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs text-white">
            {count}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* CommentRail                                                        */
/* ------------------------------------------------------------------ */

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
  const { open, setOpen, setCount } = useContext(CommentContext);
  const { toast } = useToast();
  const isDesktop = useIsDesktop();
  const [comments, setComments] = useState<Comment[]>(initialComments || []);
  const [activeQuote, setActiveQuote] = useState<{
    text: string;
    offset: number;
  } | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{
    x: number;
    y: number;
    text: string;
    context: string;
    offset: number;
  } | null>(null);

  // First-visit hint — lazy init from localStorage (avoids setState in effect)
  const [showHint, setShowHint] = useState(
    () => typeof window !== "undefined"
      && !localStorage.getItem("markbase-comment-hint-seen"),
  );

  const dismissHint = () => {
    localStorage.setItem("markbase-comment-hint-seen", "1");
    setShowHint(false);
  };

  const loadComments = useCallback(async () => {
    const data = await fetchComments(repo, branch, filePath);
    setComments(data);
  }, [repo, branch, filePath]);

  // Optimistic: add a temp comment to local state immediately
  const addOptimisticComment = useCallback((tempComment: Comment) => {
    setComments((prev) => [...prev, tempComment]);
  }, []);

  // Keep context count in sync with unresolved comments
  useEffect(() => {
    setCount(comments.filter((c) => !c.resolved_at).length);
  }, [comments, setCount]);

  // Sync server-provided comments into state when they arrive
  // (handles streaming where component mounts before data is ready)
  useEffect(() => {
    if (initialComments && initialComments.length > 0) {
      setComments(initialComments);
      return;
    }
    let cancelled = false;
    withRetry(() => fetchComments(repo, branch, filePath))
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [repo, branch, filePath, initialComments]);

  // Poll for live comment updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      withRetry(() => fetchComments(repo, branch, filePath))
        .then(setComments)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [repo, branch, filePath]);

  // Highlight commented text in the article
  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    clearCommentHighlights(article);

    // Add highlights for each quoted comment
    const quotes = comments
      .filter((c) => c.quote && !c.resolved_at)
      .map((c) => ({
        id: c.id,
        quote: c.quote!,
        offset: c.quote_context ? parseInt(c.quote_context, 10) : undefined,
      }));

    for (const { id, quote, offset } of quotes) {
      highlightText(article, quote, id, isNaN(offset as number) ? undefined : offset);
    }
  }, [comments, articleId]);

  // Listen for text selection in the article
  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    const handleMouseUp = (e: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection) {
        setSelectionPopup(null);
        return;
      }

      setSelectionPopup(
        buildSelectionPopupState(article, selection, e.clientX, e.clientY),
      );
    };

    const handleContextMenu = (e: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection) return;
      const popup = buildSelectionPopupState(
        article,
        selection,
        e.clientX,
        e.clientY,
      );
      if (!popup) return;

      e.preventDefault();
      setSelectionPopup(popup);
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
  const [contentHeight, setContentHeight] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  const updatePositions = useCallback(() => {
    const article = document.getElementById(articleId);
    const scrollContainer = document.querySelector(
      "[data-scroll-container]",
    ) as HTMLElement | null;
    if (!article || !scrollContainer) return;

    setContentHeight(scrollContainer.scrollHeight);
    setPositions(calculateCommentPositions(article, scrollContainer, unresolved));
  }, [unresolved, articleId]);

  useEffect(() => {
    const raf = requestAnimationFrame(updatePositions);
    window.addEventListener("resize", updatePositions);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePositions);
    };
  }, [updatePositions]);

  // After render, measure actual card heights and fix overlaps
  useLayoutEffect(() => {
    const container = cardsContainerRef.current;
    if (!container) return;

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-comment-card]"),
    );

    if (cards.length > 1) {
      cards.sort(
        (a, b) => parseFloat(a.style.top) - parseFloat(b.style.top),
      );

      let lastBottom = 0;
      const MIN_GAP = 8;

      for (const card of cards) {
        const currentTop = parseFloat(card.style.top);
        const adjustedTop = Math.max(currentTop, lastBottom + MIN_GAP);
        if (adjustedTop !== currentTop) {
          card.style.top = `${adjustedTop}px`;
        }
        lastBottom = adjustedTop + card.offsetHeight;
      }
    }
  }, [positions, comments]);

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

  // Hint banner — shared between desktop and mobile
  const hintBanner = showHint && (
    <div className="mx-4 mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
      <div className="flex items-start justify-between gap-2">
        <p>
          Tip: Select any text in the document, then click
          &ldquo;Comment&rdquo; to start a discussion.
        </p>
        <button
          onClick={dismissHint}
          className="shrink-0 text-blue-400 hover:text-blue-600"
        >
          &times;
        </button>
      </div>
    </div>
  );

  // Shared comment list content used by both desktop rail and mobile bottom sheet
  const commentListContent = (
    <>
      {hintBanner}

      {/* New comment from selection */}
      {activeQuote && (
        <NewCommentForm
          quote={activeQuote.text}
          quoteContext={String(activeQuote.offset)}
          repo={repo}
          branch={branch}
          filePath={filePath}
          parentId={null}
          onOptimistic={addOptimisticComment}
          toast={toast}
          onSubmit={() => {
            setActiveQuote(null);
            loadComments();
          }}
          onCancel={() => setActiveQuote(null)}
        />
      )}

      {unresolved.length === 0 && !activeQuote && (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-300 dark:text-zinc-600">
            <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No comments yet</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Select any text in the document to leave a comment.
            </p>
          </div>
        </div>
      )}

      {/* Flat comment list (no position syncing) */}
      {unresolved.map((comment) => (
        <CommentThread
          key={comment.id}
          comment={comment}
          repo={repo}
          branch={branch}
          filePath={filePath}
          onUpdate={loadComments}
          toast={toast}
        />
      ))}

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
              toast={toast}
            />
          ))}
        </details>
      )}
    </>
  );

  /* ---- Mobile / tablet: BottomSheet ---- */
  if (!isDesktop) {
    return (
      <>
        {selectionPopup && (
          <SelectionPopup
            x={selectionPopup.x}
            y={selectionPopup.y}
            onComment={() => {
              setActiveQuote({ text: selectionPopup.text, offset: selectionPopup.offset });
              setOpen(true);
              setSelectionPopup(null);
            }}
            onClose={() => setSelectionPopup(null)}
          />
        )}

        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title={`Comments (${unresolved.length})`}
        >
          {/* Add comment button for mobile (text selection is awkward) */}
          <div className="mb-3 flex justify-end">
            <button
              onClick={() => setActiveQuote({ text: "", offset: 0 })}
              className="flex items-center gap-1.5 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 010 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
              </svg>
              Add comment
            </button>
          </div>
          {commentListContent}
        </BottomSheet>
      </>
    );
  }

  /* ---- Desktop (lg:): positioned aside rail ---- */
  return (
    <>
      {/* Selection popup */}
      {selectionPopup && (
        <SelectionPopup
          x={selectionPopup.x}
          y={selectionPopup.y}
          onComment={() => {
            setActiveQuote({ text: selectionPopup.text, offset: selectionPopup.offset });
            setOpen(true);
            setSelectionPopup(null);
          }}
          onClose={() => setSelectionPopup(null)}
        />
      )}

      {/* Right rail */}
      <aside
        className={`${
          open ? "w-72" : "w-0"
        } shrink-0 overflow-hidden border-l border-zinc-200 transition-all dark:border-zinc-800`}
      >
        <div className="flex h-full w-72 flex-col">
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

          {/* Hint banner */}
          {hintBanner}

          {/* New comment from selection */}
          {activeQuote && (
            <NewCommentForm
              quote={activeQuote.text}
              quoteContext={String(activeQuote.offset)}
              repo={repo}
              branch={branch}
              filePath={filePath}
              parentId={null}
              onOptimistic={addOptimisticComment}
              toast={toast}
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
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-300 dark:text-zinc-600">
                  <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No comments yet</p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Select any text in the document to leave a comment.
                  </p>
                </div>
              </div>
            )}

            {/* Positioned comments container — match content scroll height */}
            {anchored.length > 0 && (
              <div ref={cardsContainerRef} className="relative" style={{ minHeight: contentHeight }}>
                {[...anchored]
                  .sort((a, b) => (positions[a.id] || 0) - (positions[b.id] || 0))
                  .map((comment) => (
                    <div
                      key={comment.id}
                      data-comment-card
                      className="absolute left-0 right-0"
                      style={{ top: positions[comment.id] || 0 }}
                    >
                      <CommentThread
                        comment={comment}
                        repo={repo}
                        branch={branch}
                        filePath={filePath}
                        onUpdate={loadComments}
                        toast={toast}
                      />
                    </div>
                  ))}
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
                toast={toast}
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
                    toast={toast}
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
                    toast={toast}
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
  toast,
}: {
  comment: Comment;
  repo: string;
  branch: string;
  filePath: string;
  onUpdate: () => void;
  toast: (
    message: string,
    type?: "success" | "error" | "info",
    action?: { label: string; onClick: () => void },
  ) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleResolve = () => {
    startTransition(async () => {
      if (comment.resolved_at) {
        await unresolveCommentAction(comment.id);
        onUpdate();
      } else {
        await resolveCommentAction(comment.id);
        onUpdate();
        toast("Comment resolved", "success");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const repoOwner = repo.split("/")[0];
      await deleteCommentAction(comment.id, repoOwner);
      setDeleteOpen(false);
      onUpdate();
      toast("Comment deleted", "info", {
        label: "Undo",
        onClick: () => {
          restoreCommentAction(comment.id).then(() => onUpdate());
        },
      });
    });
  };

  return (
    <div
      className={`group/thread border-b border-zinc-100 px-4 py-3 dark:border-zinc-800/50 ${
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
            className="h-5 w-5 shrink-0 rounded-full"
          />
        ) : (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium dark:bg-zinc-700">
            {comment.author_name[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">
              {comment.author_name}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {relativeTime(comment.created_at)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
            {comment.body}
          </p>
        </div>
      </div>

      {/* Actions — hover-reveal on desktop, always visible on mobile */}
      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
        <button
          onClick={() => setShowReply(!showReply)}
          className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          Reply
        </button>
        <button
          onClick={handleResolve}
          disabled={isPending}
          className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          {comment.resolved_at ? "Reopen" : "Resolve"}
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
          className="rounded-md px-2 py-1.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          Delete
        </button>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title="Delete comment"
        description="This comment and its replies will be permanently deleted."
        isPending={isPending}
      />

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
                    {relativeTime(reply.created_at)}
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
            toast={toast}
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
  onOptimistic,
  toast,
  onSubmit,
  onCancel,
}: {
  quote: string | null;
  quoteContext: string | null;
  repo: string;
  branch: string;
  filePath: string;
  parentId: string | null;
  onOptimistic?: (comment: Comment) => void;
  toast: (
    message: string,
    type?: "success" | "error" | "info",
    action?: { label: string; onClick: () => void },
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const storageKey = `markbase-draft-${filePath}-${parentId || "root"}`;
  const [body, setBody] = useState(
    () => (typeof window !== "undefined"
      ? sessionStorage.getItem(storageKey) : null) ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist draft to sessionStorage on change
  useEffect(() => {
    if (body) {
      sessionStorage.setItem(storageKey, body);
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }, [body, storageKey]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!body.trim()) return;
    const text = body.trim();

    // Optimistic insert: add a temporary comment to the list immediately
    if (onOptimistic) {
      const tempComment: Comment = {
        id: `temp-${Date.now()}`,
        file_key: "",
        quote: quote,
        quote_context: quoteContext,
        body: text,
        author_id: "self",
        author_name: "You",
        author_avatar: null,
        parent_id: parentId,
        resolved_at: null,
        resolved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        replies: [],
      };
      onOptimistic(tempComment);
    }

    // Clear form and draft immediately
    setBody("");
    sessionStorage.removeItem(storageKey);

    startTransition(async () => {
      await addComment({
        repo,
        branch,
        filePath,
        quote,
        quoteContext,
        body: text,
        parentId,
      });
      toast("Comment added", "success");
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

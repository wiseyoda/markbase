"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useContext,
} from "react";
import { fetchComments } from "./comment-actions";
import type { Comment } from "@/lib/comments";
import { useIsDesktop } from "@/hooks/use-media-query";
import {
  buildSelectionPopupState,
  calculateCommentPositions,
  clearCommentHighlights,
  highlightText,
  withRetry,
} from "@/lib/comment-dom";
import { BottomSheet } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";

// Re-export context pieces so external importers don't need to change
export { CommentProvider, CommentToggle } from "./comment-context";
import { CommentContext } from "./comment-context";

import { SelectionPopup } from "./selection-popup";
import { CommentThread } from "./comment-thread";
import { NewCommentForm } from "./comment-form";

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

  // Sync server-provided comments when props change (render-time derivation,
  // handles streaming where component mounts before data is ready)
  const [prevInitial, setPrevInitial] = useState(initialComments);
  if (initialComments && initialComments.length > 0 && initialComments !== prevInitial) {
    setPrevInitial(initialComments);
    setComments(initialComments);
  }

  // Fetch fallback when no initial comments are provided
  useEffect(() => {
    if (initialComments && initialComments.length > 0) return;
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

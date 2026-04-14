"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface TldrCalloutProps {
  owner: string;
  repo: string;
  filePath: string;
  /** Cached summary text available at SSR time. Skips the fetch entirely. */
  initialSummary?: string | null;
  /** Share ID for share-page lookups. Omitted for authenticated repo viewer. */
  shareId?: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: string }
  | { status: "empty" }
  | { status: "error" };

const DISMISS_KEY_PREFIX = "markbase-tldr-dismiss:";

function dismissKey(owner: string, repo: string, filePath: string): string {
  return `${DISMISS_KEY_PREFIX}${owner}/${repo}/${filePath}`;
}

/** useSyncExternalStore-backed dismiss persistence so the banner stays hidden after reload. */
function useDismissed(owner: string, repo: string, filePath: string) {
  const key = dismissKey(owner, repo, filePath);

  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(key) === "1";
  }, [key]);

  const isDismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, "1");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }
  }, [key]);

  return { isDismissed, dismiss };
}

export function TldrCallout({
  owner,
  repo,
  filePath,
  initialSummary,
  shareId,
}: TldrCalloutProps) {
  const [state, setState] = useState<FetchState>(
    initialSummary
      ? { status: "ready", summary: initialSummary }
      : { status: "loading" },
  );
  const fetchedRef = useRef(false);
  const { isDismissed, dismiss } = useDismissed(owner, repo, filePath);

  useEffect(() => {
    // StrictMode-safe: the ref prevents duplicate fetches across double-
    // invocation, and we don't cancel on cleanup. React 19 silently ignores
    // setState on an unmounted component, so late-arriving responses are fine.
    if (initialSummary || fetchedRef.current) return;
    fetchedRef.current = true;

    const params = new URLSearchParams({
      owner,
      repo,
      path: filePath,
    });
    if (shareId) params.set("shareId", shareId);

    fetch(`/api/summary?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const body = (await res.json()) as {
          enabled: boolean;
          summary: { text: string } | null;
        };
        if (!body.enabled) {
          setState({ status: "empty" });
          return;
        }
        if (body.summary?.text) {
          setState({ status: "ready", summary: body.summary.text });
        } else {
          setState({ status: "empty" });
        }
      })
      .catch(() => {
        setState({ status: "error" });
      });
  }, [owner, repo, filePath, shareId, initialSummary]);

  if (isDismissed) return null;
  if (state.status === "idle" || state.status === "empty" || state.status === "error") {
    return null;
  }

  return (
    <aside
      className="group relative mb-6 flex gap-3 rounded-lg border border-sky-200/70 bg-sky-50/70 p-4 pr-10 text-sm text-zinc-700 shadow-sm dark:border-sky-500/20 dark:bg-sky-500/5 dark:text-zinc-300"
      aria-label="AI-generated summary"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 items-center rounded-full bg-sky-500/15 px-2 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-[#86D5F4]"
      >
        TL;DR
      </span>
      <div className="flex-1 leading-relaxed">
        {state.status === "loading" ? (
          <span className="inline-flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500/70" />
            Summarizing document…
          </span>
        ) : (
          state.summary
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide summary"
        className="absolute right-2 top-2 rounded p-1 text-zinc-400 opacity-60 transition-opacity hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
        </svg>
      </button>
    </aside>
  );
}

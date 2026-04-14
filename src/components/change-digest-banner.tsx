"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface ChangeDigestBullet {
  sha: string;
  shortSha: string;
  summary: string;
  date: string;
  author: {
    login: string;
    avatarUrl: string;
  };
  messageFirstLine: string;
}

interface RawDigest {
  fromSha: string | null;
  toSha: string;
  bullets: Array<{
    sha: string;
    shortSha: string;
    summary: string;
    date: string;
    author: { login: string; avatarUrl: string };
    messageFirstLine: string;
  }>;
  synthesis: string | null;
  approximate: boolean;
  isFirstView: boolean;
}

export interface ChangeDigestBannerProps {
  owner: string;
  repo: string;
  filePath: string;
  /** Baseline commit sha — what the user has previously acknowledged. Null = first-ever view, banner shows "Recent updates". */
  fromCommitSha: string | null;
  /** Current commit sha at SSR time. The diff target and dismiss key. */
  toCommitSha: string;
  /** Current blob sha, sent to /api/file-view when the user dismisses. */
  currentBlobSha: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; digest: RawDigest }
  | { status: "empty" };

const DISMISS_KEY_PREFIX = "markbase-change-digest-dismiss:";

function dismissKey(owner: string, repo: string, filePath: string, toSha: string): string {
  return `${DISMISS_KEY_PREFIX}${owner}/${repo}/${filePath}:${toSha}`;
}

function useDismissed(key: string) {
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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function ChangeDigestBanner({
  owner,
  repo,
  filePath,
  fromCommitSha,
  toCommitSha,
  currentBlobSha,
}: ChangeDigestBannerProps) {
  const [expanded, setExpanded] = useState(true);
  const key = dismissKey(owner, repo, filePath, toCommitSha);
  const { isDismissed, dismiss: dismissLocally } = useDismissed(key);

  const handleDismiss = () => {
    dismissLocally();
    // Advance the server-side baseline so the banner doesn't reappear on
    // subsequent page loads until new commits arrive. Fire-and-forget; the
    // local dismiss already hid the banner.
    fetch("/api/file-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner,
        repo,
        path: filePath,
        commitSha: toCommitSha,
        blobSha: currentBlobSha,
      }),
    }).catch(() => {});
  };

  // Fetch any time we have a target commit. `fromCommitSha` being null just
  // means this is a first-ever view for the user — the server will return
  // the latest few commits as a "Recent updates" digest.
  const shouldFetch = Boolean(
    toCommitSha && (!fromCommitSha || fromCommitSha !== toCommitSha),
  );
  const [state, setState] = useState<LoadState>(
    shouldFetch ? { status: "loading" } : { status: "idle" },
  );
  // Keyed dedupe set so StrictMode's double-invocation dedupes, but a
  // navigation to a new file (or a new commit range) still fires a fresh
  // fetch. A plain boolean ref would leak across route changes.
  const fetchedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!shouldFetch) return;
    const key = `${owner}/${repo}/${filePath}:${fromCommitSha ?? ""}->${toCommitSha}`;
    if (fetchedKeysRef.current.has(key)) return;
    fetchedKeysRef.current.add(key);

    const params = new URLSearchParams({
      owner,
      repo,
      path: filePath,
      to: toCommitSha,
    });
    if (fromCommitSha) params.set("from", fromCommitSha);

    fetch(`/api/change-digest?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: "empty" });
          return;
        }
        const body = (await res.json()) as {
          enabled: boolean;
          digest: RawDigest | null;
        };
        if (!body.enabled || !body.digest || body.digest.bullets.length === 0) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "ready", digest: body.digest });
      })
      .catch(() => {
        setState({ status: "empty" });
      });
  }, [shouldFetch, owner, repo, filePath, fromCommitSha, toCommitSha]);

  if (!shouldFetch || isDismissed) return null;
  if (state.status === "idle" || state.status === "empty") return null;

  const isLoading = state.status === "loading";
  const digest = state.status === "ready" ? state.digest : null;
  const bullets = digest?.bullets ?? [];
  const synthesis = digest?.synthesis ?? null;
  const approximate = digest?.approximate ?? false;
  const isFirstView = digest?.isFirstView ?? false;

  const label = isLoading
    ? "Checking what changed…"
    : isFirstView
      ? bullets.length === 1
        ? "Recent update"
        : `${bullets.length} recent updates`
      : bullets.length === 1
        ? "1 update since you last viewed"
        : `${bullets.length} updates since you last viewed`;

  return (
    <aside
      className="mb-4 overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/70 text-sm text-zinc-700 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-zinc-300"
      aria-label="Change digest"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-controls="change-digest-body"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-5 items-center rounded-full bg-amber-500/15 px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
          >
            New
          </span>
          <span className="flex-1 font-medium text-zinc-800 dark:text-zinc-200">
            {label}
            {approximate && (
              <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                (approximate — last view is beyond recent history)
              </span>
            )}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            className={`text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M4.427 6.427a.75.75 0 011.06 0L8 8.94l2.513-2.513a.75.75 0 111.06 1.06l-3.043 3.043a.75.75 0 01-1.06 0L4.427 7.487a.75.75 0 010-1.06z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Hide change digest"
          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>
      {expanded && !isLoading && (
        <div
          id="change-digest-body"
          className="border-t border-amber-200/70 px-4 py-3 dark:border-amber-500/20"
        >
          {synthesis && (
            <p className="mb-3 leading-relaxed text-zinc-700 dark:text-zinc-300">{synthesis}</p>
          )}
          <ul className="flex flex-col gap-2.5">
            {bullets.map((bullet) => (
              <li key={bullet.sha} className="flex gap-2.5">
                {bullet.author.avatarUrl ? (
                  <Image
                    src={bullet.author.avatarUrl}
                    alt={bullet.author.login}
                    width={20}
                    height={20}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-full"
                    unoptimized
                  />
                ) : (
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                )}
                <div className="flex-1 leading-relaxed">
                  <span>{bullet.summary}</span>
                  <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                    — {bullet.author.login}, {relativeTime(bullet.date)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

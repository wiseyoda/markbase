"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { diffLines } from "diff";
import { fetchFileHistory, fetchFileAtCommit } from "./history-actions";
import type { FileCommit } from "@/lib/github";

interface HistoryPanelProps {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  currentContent: string;
  shareId?: string;
}

export function HistoryButton(props: HistoryPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="text-zinc-500"
        >
          <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.751.751 0 017 8.25v-3.5A.75.75 0 017.75 4z" />
        </svg>
        History
      </button>
      {open && (
        <HistoryPanel {...props} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function HistoryPanel({
  owner,
  repo,
  branch,
  filePath,
  currentContent: _currentContent,
  shareId,
  onClose,
}: HistoryPanelProps & { onClose: () => void }) {
  void _currentContent; // Reserved for future inline diff
  const [commits, setCommits] = useState<FileCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffLine[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"diff" | "full">("diff");
  const [fullContent, setFullContent] = useState<string | null>(null);

  useEffect(() => {
    fetchFileHistory(owner, repo, branch, filePath, shareId).then((data) => {
      setCommits(data);
      setLoading(false);
    });
  }, [owner, repo, branch, filePath, shareId]);

  const loadDiff = useCallback(
    async (sha: string, prevSha: string | null) => {
      setSelectedSha(sha);
      setDiffLoading(true);
      setDiffData(null);
      setFullContent(null);

      const [newContent, oldContent] = await Promise.all([
        fetchFileAtCommit(owner, repo, sha, filePath, shareId),
        prevSha
          ? fetchFileAtCommit(owner, repo, prevSha, filePath, shareId)
          : Promise.resolve(""),
      ]);

      if (newContent !== null) {
        setFullContent(newContent);
        const changes = diffLines(oldContent || "", newContent);
        const lines: DiffLine[] = [];

        for (const change of changes) {
          const text = change.value.replace(/\n$/, "");
          const splitLines = text.split("\n");
          for (const line of splitLines) {
            if (change.added) {
              lines.push({ type: "add", text: line });
            } else if (change.removed) {
              lines.push({ type: "remove", text: line });
            } else {
              lines.push({ type: "context", text: line });
            }
          }
        }
        setDiffData(lines);
      }
      setDiffLoading(false);
    },
    [owner, repo, filePath, shareId],
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">File History</h2>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">
              {filePath}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 011.275.326.749.749 0 01-.215.734L9.06 8l3.22 3.22a.749.749 0 01-.326 1.275.749.749 0 01-.734-.215L8 9.06l-3.22 3.22a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Commit list */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
            {loading ? (
              <div className="p-4 text-sm text-zinc-400">Loading commits...</div>
            ) : commits.length === 0 ? (
              <div className="p-4 text-sm text-zinc-400">No history found</div>
            ) : (
              commits.map((commit, i) => {
                const prevSha = i < commits.length - 1 ? commits[i + 1].sha : null;
                const isSelected = selectedSha === commit.sha;
                return (
                  <button
                    key={commit.sha}
                    onClick={() => loadDiff(commit.sha, prevSha)}
                    className={`flex w-full flex-col gap-1 border-b border-zinc-100 px-4 py-3 text-left transition-colors dark:border-zinc-800/50 ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950/50"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {commit.author.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={commit.author.avatar_url}
                          alt=""
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] dark:bg-zinc-700">
                          {commit.author.login[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {commit.author.login}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {commit.message}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                      <span>{formatDate(commit.date)}</span>
                      <span className="font-mono">{commit.sha.slice(0, 7)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Diff view */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {!selectedSha && (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
                Select a commit to view changes
              </div>
            )}

            {diffLoading && (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
                Loading diff...
              </div>
            )}

            {diffData && !diffLoading && (
              <>
                {/* Diff toolbar */}
                <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="text-green-500">
                      +{diffData.filter((l) => l.type === "add").length}
                    </span>
                    <span className="text-red-500">
                      -{diffData.filter((l) => l.type === "remove").length}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setViewMode("diff")}
                      className={`rounded px-2 py-1 text-xs ${
                        viewMode === "diff"
                          ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                          : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      }`}
                    >
                      Diff
                    </button>
                    <button
                      onClick={() => setViewMode("full")}
                      className={`rounded px-2 py-1 text-xs ${
                        viewMode === "full"
                          ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                          : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      }`}
                    >
                      Full file
                    </button>
                  </div>
                </div>

                {/* Diff content */}
                <div className="flex-1 overflow-y-auto font-mono text-sm">
                  {viewMode === "diff" ? (
                    <div className="min-w-0">
                      {diffData.map((line, i) => (
                        <div
                          key={i}
                          className={`flex border-b border-zinc-100/50 dark:border-zinc-800/30 ${
                            line.type === "add"
                              ? "bg-green-500/10"
                              : line.type === "remove"
                                ? "bg-red-500/10"
                                : ""
                          }`}
                        >
                          <span
                            className={`w-8 shrink-0 select-none px-2 py-0.5 text-right text-[10px] ${
                              line.type === "add"
                                ? "text-green-500"
                                : line.type === "remove"
                                  ? "text-red-500"
                                  : "text-zinc-400"
                            }`}
                          >
                            {line.type === "add"
                              ? "+"
                              : line.type === "remove"
                                ? "-"
                                : " "}
                          </span>
                          <pre className="flex-1 whitespace-pre-wrap break-words px-2 py-0.5">
                            <span
                              className={
                                line.type === "add"
                                  ? "text-green-300"
                                  : line.type === "remove"
                                    ? "text-red-300"
                                    : "text-zinc-400 dark:text-zinc-500"
                              }
                            >
                              {line.text}
                            </span>
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap p-4 text-zinc-300">
                      {fullContent}
                    </pre>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

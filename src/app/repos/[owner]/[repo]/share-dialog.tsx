"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { createShareAction } from "./share-actions";

interface ShareDialogProps {
  repo: string;
  branch: string;
  currentFile: string | null;
}

export function ShareButton({ repo, branch }: Omit<ShareDialogProps, "currentFile">) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Derive current file from URL: /repos/owner/repo/path/to/file.md
  const [owner, repoName] = repo.split("/");
  const prefix = `/repos/${owner}/${repoName}/`;
  const currentFile = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length) || null
    : null;

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
          <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z" />
        </svg>
        Share
      </button>

      {open && (
        <ShareModal
          repo={repo}
          branch={branch}
          currentFile={currentFile}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareModal({
  repo,
  branch,
  currentFile,
  onClose,
}: ShareDialogProps & { onClose: () => void }) {
  const [type, setType] = useState<"file" | "repo">(
    currentFile ? "file" : "repo",
  );
  const [expiry, setExpiry] = useState<string>("7d");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    startTransition(async () => {
      const id = await createShareAction({
        type,
        repo,
        branch,
        filePath: type === "file" ? currentFile : null,
        expiresIn: expiry === "never" ? null : expiry,
      });
      const base = window.location.origin;
      setShareUrl(`${base}/s/${id}`);
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            &times;
          </button>
        </div>

        {!shareUrl ? (
          <>
            {/* Type selector */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Share type
              </label>
              <div className="flex gap-2">
                {currentFile && (
                  <button
                    onClick={() => setType("file")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      type === "file"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    This file
                  </button>
                )}
                <button
                  onClick={() => setType("repo")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    type === "repo"
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  Entire repo
                </button>
              </div>
            </div>

            {/* What's being shared */}
            <div className="mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {type === "file" && currentFile ? (
                <>
                  <span className="text-zinc-400">{repo}/</span>
                  {currentFile}
                </>
              ) : (
                <>
                  All .md files in <span className="font-medium">{repo}</span>
                </>
              )}
            </div>

            {/* Expiry */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Expires
              </label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <option value="1h">1 hour</option>
                <option value="1d">1 day</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="never">Never</option>
              </select>
            </div>

            <button
              onClick={handleCreate}
              disabled={isPending}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isPending ? "Creating..." : "Create share link"}
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Anyone with this link can view{" "}
              {type === "file" ? "this file" : "all markdown files in this repo"}
              .
              {expiry !== "never" && ` Link expires in ${expiry}.`}
            </p>
          </>
        )}
      </div>
    </>
  );
}

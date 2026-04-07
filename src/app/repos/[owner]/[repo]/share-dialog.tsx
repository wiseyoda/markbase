"use client";

import { useState, useTransition, createContext, useContext, useRef } from "react";
import { usePathname } from "next/navigation";
import { createShareAction, searchGitHubUsers } from "./share-actions";
import type { GitHubUserResult } from "./share-actions";
import { useIsMobile } from "@/hooks/use-media-query";
import { BottomSheet } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";

type ShareType = "file" | "folder" | "repo";

interface ShareModalState {
  open: boolean;
  defaultType: ShareType;
  targetPath: string | null;
}

interface ShareContextValue {
  openShare: (type: ShareType, path: string | null) => void;
}

const ShareContext = createContext<ShareContextValue>({
  openShare: () => {},
});

export function useShareDialog() {
  return useContext(ShareContext);
}

export function ShareProvider({
  repo,
  branch,
  children,
}: {
  repo: string;
  branch: string;
  children: React.ReactNode;
}) {
  const [modal, setModal] = useState<ShareModalState>({
    open: false,
    defaultType: "repo",
    targetPath: null,
  });

  const openShare = (type: ShareType, path: string | null) => {
    setModal({ open: true, defaultType: type, targetPath: path });
  };

  return (
    <ShareContext.Provider value={{ openShare }}>
      {children}
      {modal.open && (
        <ShareModal
          repo={repo}
          branch={branch}
          defaultType={modal.defaultType}
          targetPath={modal.targetPath}
          onClose={() => setModal((s) => ({ ...s, open: false }))}
        />
      )}
    </ShareContext.Provider>
  );
}

export function ShareButton({ repo }: { repo: string; branch: string }) {
  const { openShare } = useShareDialog();
  const pathname = usePathname();

  const [owner, repoName] = repo.split("/");
  const prefix = `/repos/${owner}/${repoName}/`;
  const currentFile = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length) || null
    : null;

  return (
    <button
      onClick={() => openShare(currentFile ? "file" : "repo", currentFile)}
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
  );
}

function ShareModal({
  repo,
  branch,
  defaultType,
  targetPath,
  onClose,
}: {
  repo: string;
  branch: string;
  defaultType: ShareType;
  targetPath: string | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [type, setType] = useState<ShareType>(defaultType);
  const [shareMode, setShareMode] = useState<"link" | "user">("link");
  const [expiry, setExpiry] = useState<string>("7d");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<GitHubUserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<GitHubUserResult | null>(null);
  const [userShared, setUserShared] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const folderPath = targetPath
    ? targetPath.includes("/")
      ? targetPath.split("/").slice(0, -1).join("/")
      : null
    : null;

  // For folder shares opened from context menu, targetPath IS the folder
  const effectiveFolderPath =
    defaultType === "folder" ? targetPath : folderPath;

  const filePath = (() => {
    if (type === "file") return targetPath;
    if (type === "folder") return effectiveFolderPath;
    return null;
  })();

  const description = (() => {
    if (type === "file" && targetPath) {
      return (
        <>
          <span className="text-zinc-400">{repo}/</span>
          {targetPath}
        </>
      );
    }
    if (type === "folder" && effectiveFolderPath) {
      return (
        <>
          All .md files in{" "}
          <span className="font-medium">
            {repo}/{effectiveFolderPath}/
          </span>
        </>
      );
    }
    return (
      <>
        All .md files in <span className="font-medium">{repo}</span>
      </>
    );
  })();

  const handleUserSearch = (q: string) => {
    setUserQuery(q);
    setSelectedUser(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setUserResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const results = await searchGitHubUsers(q);
      setUserResults(results);
    }, 300);
  };

  const handleCreate = () => {
    startTransition(async () => {
      const id = await createShareAction({
        type,
        repo,
        branch,
        filePath,
        expiresIn: shareMode === "link" ? (expiry === "never" ? null : expiry) : null,
        sharedWith: shareMode === "user" && selectedUser ? String(selectedUser.id) : null,
        sharedWithName: shareMode === "user" && selectedUser ? selectedUser.login : null,
      });

      if (shareMode === "user") {
        setUserShared(true);
        toast(`Shared with ${selectedUser?.login}`, "success");
      } else {
        const base = window.location.origin;
        setShareUrl(`${base}/s/${id}`);
        toast("Share link created", "success");
      }
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const typeButton = (t: ShareType, label: string, show: boolean) =>
    show && (
      <button
        key={t}
        onClick={() => setType(t)}
        className={`min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
          type === t
            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }`}
      >
        {label}
      </button>
    );

  const dialogContent = (
    <>
      {!shareUrl && !userShared ? (
        <>
          {/* Share type */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Share type
            </label>
            <div className="flex gap-2">
              {typeButton("file", "This file", !!targetPath)}
              {typeButton("folder", "This folder", !!effectiveFolderPath)}
              {typeButton("repo", "Entire repo", true)}
            </div>
          </div>

          <div className="mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {description}
          </div>

          <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
            Share links are read-only. Recipients can view and comment but not edit.
          </p>

          {/* Share mode: link vs user */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Share with
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShareMode("link")}
                className={`min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  shareMode === "link"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                Anyone with link
              </button>
              <button
                onClick={() => setShareMode("user")}
                className={`min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  shareMode === "user"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                Specific user
              </button>
            </div>
          </div>

          {/* Link mode: expiry */}
          {shareMode === "link" && (
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Expires
              </label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <option value="1h">1 hour</option>
                <option value="1d">1 day</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="never">Never</option>
              </select>
            </div>
          )}

          {/* User mode: search */}
          {shareMode === "user" && (
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                GitHub username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedUser ? selectedUser.login : userQuery}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
                {userResults.length > 0 && !selectedUser && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {userResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => {
                          setSelectedUser(user);
                          setUserQuery(user.login);
                          setUserResults([]);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={user.avatar_url}
                          alt=""
                          className="h-5 w-5 rounded-full"
                        />
                        <span>{user.login}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedUser.avatar_url}
                    alt=""
                    className="h-5 w-5 rounded-full"
                  />
                  <span className="text-sm">{selectedUser.login}</span>
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setUserQuery("");
                    }}
                    className="ml-auto text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={isPending || (shareMode === "user" && !selectedUser)}
            className="min-h-[44px] w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending
              ? "Creating..."
              : shareMode === "user"
                ? "Share with user"
                : "Create share link"}
          </button>
        </>
      ) : userShared ? (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-green-50 px-4 py-3 dark:bg-green-950">
            {selectedUser && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedUser.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            )}
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Shared with {selectedUser?.login}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                They&apos;ll see it in their &quot;Shared with me&quot; on their dashboard.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
            <input
              type="text"
              readOnly
              value={shareUrl || ""}
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
            {type === "file"
              ? "this file"
              : type === "folder"
                ? "files in this folder"
                : "all markdown files in this repo"}
            .
            {expiry !== "never" && ` Expires in ${expiry}.`}
          </p>
        </>
      )}
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet open={true} onClose={onClose} title="Share">
        {dialogContent}
      </BottomSheet>
    );
  }

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

        {dialogContent}
      </div>
    </>
  );
}

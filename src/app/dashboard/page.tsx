import type { Metadata } from "next";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSyncedRepos } from "@/lib/synced-repos";
import { listShares, listSharesWithMe } from "@/lib/shares";
import {
  getRecentCommentsForRepos,
  countOpenCommentsForRepos,
} from "@/lib/comments";
import { withDbRetry } from "@/lib/db";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { RepoList } from "./repo-list";
import { Logo } from "@/components/logo";
import { getReposByName, LANGUAGE_COLORS } from "@/lib/dashboard";
import { timeAgo } from "@/lib/format";
import type { Comment } from "@/lib/comments";
import type { Share } from "@/lib/shares";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface ActivityItem {
  type: "comment" | "share";
  id: string;
  title: string;
  detail: string;
  href: string;
  avatar: string | null;
  actor: string;
  timestamp: string;
}

function buildActivityItems(
  comments: Comment[],
  shares: Share[],
  currentUserName: string,
  currentUserAvatar: string | null,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const c of comments) {
    // file_key format: owner/repo/branch/path/to/file.md
    const parts = c.file_key.split("/");
    const repo = `${parts[0]}/${parts[1]}`;
    const filePath = parts.slice(3).join("/");
    const fileName = parts[parts.length - 1];
    items.push({
      type: "comment",
      id: `c-${c.id}`,
      title: `Commented on ${fileName}`,
      detail: repo,
      href: `/repos/${parts[0]}/${parts[1]}/${filePath}`,
      avatar: c.author_avatar,
      actor: c.author_name,
      timestamp: c.created_at,
    });
  }

  for (const s of shares.slice(0, 5)) {
    const label =
      s.type === "file"
        ? s.file_path?.split("/").pop() || "file"
        : s.type === "folder"
          ? `${s.file_path}/`
          : "entire repo";
    items.push({
      type: "share",
      id: `s-${s.id}`,
      title: `Shared ${label}`,
      detail: s.shared_with_name ? `with ${s.shared_with_name}` : s.repo,
      href: `/s/${s.id}`,
      avatar: currentUserAvatar,
      actor: currentUserName,
      timestamp: s.created_at,
    });
  }

  items.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return items.slice(0, 5);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");

  const userId = session.user?.id || "";

  // All DB queries + pinned repo metadata in parallel — no bulk GitHub calls
  const [syncedRepos, sharedWithMe, myShares] = await Promise.all([
    withDbRetry(() => getSyncedRepos()),
    userId ? withDbRetry(() => listSharesWithMe(userId)) : Promise.resolve([]),
    userId ? withDbRetry(() => listShares(userId)) : Promise.resolve([]),
  ]);

  // Fetch pinned repo metadata + activity data (depends on syncedRepos)
  const [syncedRepoData, recentComments, openCommentCount] = await Promise.all([
    getReposByName(session.accessToken, syncedRepos),
    withDbRetry(() => getRecentCommentsForRepos(syncedRepos, 5)),
    withDbRetry(() => countOpenCommentsForRepos(syncedRepos)),
  ]);

  const firstName = session.user?.name?.split(" ")[0] || "there";
  const greeting = getGreeting();
  const userAvatar = session.user?.image || null;

  const activity = buildActivityItems(
    recentComments,
    myShares,
    session.user?.name || firstName,
    userAvatar,
  );

  return (
    <KeyboardShortcutsProvider>
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Logo size={24} />
          markbase
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/shares"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Shared links
          </Link>
          <div className="flex items-center gap-2">
            {userAvatar && (
              <Image
                src={userAvatar}
                alt=""
                width={28}
                height={28}
                className="rounded-full"
              />
            )}
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {session.user?.name}
            </span>
          </div>
          <ThemeToggle />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {/* Welcome zone */}
        <div className="mb-10">
          <h2 className="text-xl font-medium">
            {greeting}, {firstName}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              <strong className="text-[#86D5F4]">{syncedRepos.length}</strong>{" "}
              {syncedRepos.length === 1 ? "repo" : "repos"}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
            <span>
              <strong className="text-[#86D5F4]">{openCommentCount}</strong>{" "}
              open {openCommentCount === 1 ? "comment" : "comments"}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
            <span>
              <strong className="text-[#86D5F4]">{myShares.length}</strong>{" "}
              {myShares.length === 1 ? "share" : "shares"}
            </span>
          </div>
        </div>

        {/* Your repos */}
        {syncedRepoData.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your repos</h2>
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                {syncedRepos.length} added
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {syncedRepoData.map((repo) => {
                const [owner, repoName] = repo.full_name.split("/");
                return (
                  <Link
                    key={repo.full_name}
                    href={`/repos/${owner}/${repoName}`}
                    className="group flex flex-col gap-2 rounded-lg border border-zinc-200 border-l-[3px] border-l-[#86D5F4] px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:border-l-[#86D5F4] dark:hover:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-400 dark:text-zinc-500">
                          {owner}/
                        </span>
                        <span className="text-sm font-medium">{repoName}</span>
                        {repo.private && (
                          <span className="rounded-full border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-600 dark:text-zinc-500">
                            private
                          </span>
                        )}
                      </div>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-700 dark:group-hover:text-zinc-400"
                      >
                        <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
                      </svg>
                    </div>
                    {repo.description && (
                      <p className="line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {repo.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                      {repo.language && (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                LANGUAGE_COLORS[repo.language] || "#6b7280",
                            }}
                          />
                          {repo.language}
                        </span>
                      )}
                      <span>Pushed {timeAgo(repo.pushed_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {syncedRepos.length === 0 && (
          <div className="mb-10 rounded-lg border border-dashed border-[#86D5F4]/30 px-6 py-8 text-center">
            <h2 className="text-base font-semibold">Get started</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Add a repository to start browsing and sharing your markdown files.
              Find a repo below and click <strong className="text-[#86D5F4]">Add</strong> to pin it here.
            </p>
          </div>
        )}

        {/* Recent activity */}
        {activity.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
            <div className="flex flex-col">
              {activity.map((item, i) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-start gap-3 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                    i < activity.length - 1
                      ? "border-b border-zinc-100 dark:border-zinc-800/50"
                      : ""
                  }`}
                >
                  {item.avatar ? (
                    <Image
                      src={item.avatar}
                      alt=""
                      width={24}
                      height={24}
                      className="mt-0.5 shrink-0 rounded-full"
                    />
                  ) : (
                    <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{item.actor}</span>{" "}
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {item.title.toLowerCase()}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    {timeAgo(item.timestamp)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Shared with me */}
        {sharedWithMe.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Shared with me</h2>
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                {sharedWithMe.length} shared
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {sharedWithMe.map((share) => {
                const [shareOwner, shareRepo] = share.repo.split("/");
                const typeLabel =
                  share.type === "file"
                    ? share.file_path?.split("/").pop() || "file"
                    : share.type === "folder"
                      ? `${share.file_path}/`
                      : "entire repo";

                return (
                  <Link
                    key={share.id}
                    href={`/s/${share.id}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 border-l-[3px] border-l-[#86D5F4] px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:border-l-[#86D5F4] dark:hover:bg-zinc-900"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {share.type}
                        </span>
                        <span className="text-sm text-zinc-400 dark:text-zinc-500">
                          {shareOwner}/
                        </span>
                        <span className="text-sm font-medium">
                          {shareRepo}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {typeLabel}
                      </span>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="text-zinc-400"
                    >
                      <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* All repos — loaded on demand */}
        <RepoList syncedRepos={syncedRepos} />
      </main>
    </div>
    </KeyboardShortcutsProvider>
  );
}

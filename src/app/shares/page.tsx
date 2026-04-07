import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listShares } from "@/lib/shares";
import { ShareActions } from "./share-actions-client";
import { timeAgo, expiryLabel } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function SharesPage() {
  const session = await auth();
  if (!session) redirect("/");
  const userId = session.user?.id;
  if (!userId) redirect("/");

  const shares = await listShares(userId);

  // Group by repo
  const byRepo = new Map<string, typeof shares>();
  for (const share of shares) {
    const list = byRepo.get(share.repo) || [];
    list.push(share);
    byRepo.set(share.repo, list);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-lg font-semibold">
            markbase
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Shared links
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
        {shares.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 dark:text-zinc-400">
            No shared links yet. Share a file or repo from the viewer.
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {Array.from(byRepo.entries()).map(([repoName, repoShares]) => (
              <section key={repoName}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {repoName}
                  </h3>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {repoShares.length} share{repoShares.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {repoShares.map((share) => (
                    <div
                      key={share.id}
                      className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="flex flex-col gap-1.5">
                          {/* Type + path */}
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                share.type === "repo"
                                  ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                                  : share.type === "folder"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              }`}
                            >
                              {share.type}
                            </span>
                            <span className="text-sm font-medium">
                              {share.type === "repo"
                                ? "Entire repository"
                                : share.file_path || "—"}
                            </span>
                          </div>

                          {/* Shared with */}
                          <div className="flex items-center gap-2 text-xs">
                            {share.shared_with ? (
                              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M10.561 8.073a6.005 6.005 0 013.432 5.142.75.75 0 11-1.498.07 4.5 4.5 0 00-8.99 0 .75.75 0 11-1.498-.07 6.004 6.004 0 013.431-5.142 3.999 3.999 0 115.123 0zM10.5 5a2.5 2.5 0 10-5 0 2.5 2.5 0 005 0z" />
                                </svg>
                                Shared with{" "}
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                                  {share.shared_with_name || "user"}
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M4.75 7.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
                                  <path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-6.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z" />
                                </svg>
                                Anyone with link
                              </span>
                            )}
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                            <span>Created {timeAgo(share.created_at)}</span>
                            <span>·</span>
                            <span>Expires: {expiryLabel(share.expires_at)}</span>
                            <span>·</span>
                            <span className="font-mono">{share.id}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <ShareActions shareId={share.id} shareType={share.type} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

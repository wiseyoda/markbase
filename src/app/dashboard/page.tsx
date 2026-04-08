import type { Metadata } from "next";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "Dashboard",
};
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSyncedRepos } from "@/lib/synced-repos";
import { listSharesWithMe } from "@/lib/shares";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { RepoList } from "./repo-list";
import { Logo } from "@/components/logo";
import { getRepos, getUsername, groupRepos } from "@/lib/dashboard";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const userId = session.user?.id || "";
  const [repos, username, syncedRepos, sharedWithMe] = await Promise.all([
    getRepos(session.accessToken),
    getUsername(session.accessToken),
    getSyncedRepos(),
    userId ? listSharesWithMe(userId) : Promise.resolve([]),
  ]);

  const groups = groupRepos(repos, username);

  return (
    <KeyboardShortcutsProvider>
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
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
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {session.user?.name}
          </span>
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

      <main id="main-content" className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
        {/* Your repos */}
        {syncedRepos.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your repos</h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {syncedRepos.length} added
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {syncedRepos.map((fullName) => {
                const [owner, repoName] = fullName.split("/");
                return (
                  <Link
                    key={fullName}
                    href={`/repos/${owner}/${repoName}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">
                        {owner}/
                      </span>
                      <span className="text-sm font-medium">{repoName}</span>
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

        {/* Your repos empty state */}
        {syncedRepos.length === 0 && (
          <div className="mb-10 rounded-lg border border-dashed border-zinc-300 px-6 py-8 text-center dark:border-zinc-700">
            <h2 className="text-base font-semibold">Get started</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Add a repository to start browsing and sharing your markdown files.
              Find a repo below and click <strong>Add</strong> to add it here.
            </p>
            <div className="mx-auto mt-4 flex max-w-xs items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
              <span className="shrink-0">Tip:</span>
              <span>Added repos appear at the top for quick access.</span>
            </div>
          </div>
        )}

        {/* Shared with me */}
        {sharedWithMe.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Shared with me</h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
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
                    href={
                      share.type === "file" && share.file_path
                        ? `/s/${share.id}`
                        : `/s/${share.id}`
                    }
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
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

        {/* All repos — client component with search */}
        <RepoList
          groups={groups}
          syncedRepos={syncedRepos}
          totalCount={repos.length}
        />
      </main>
    </div>
    </KeyboardShortcutsProvider>
  );
}

import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSyncedRepos } from "@/lib/synced-repos";
import { listSharesWithMe } from "@/lib/shares";
import { ThemeToggle } from "@/components/theme-toggle";
import { RepoList } from "./repo-list";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  archived: boolean;
  language: string | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  topics: string[];
  owner: {
    login: string;
    type: string;
  };
}

async function getRepos(accessToken: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=pushed&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
        next: { revalidate: 60 },
      },
    );

    if (!res.ok) break;

    const batch: GitHubRepo[] = await res.json();
    repos.push(...batch);

    if (batch.length < 100) break;
    page++;
  }

  return repos;
}

async function getUsername(accessToken: string): Promise<string> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
    next: { revalidate: 300 },
  });
  const user = await res.json();
  return user.login;
}

function groupRepos(
  repos: GitHubRepo[],
  username: string,
): { owner: string; type: string; active: GitHubRepo[]; archived: GitHubRepo[] }[] {
  const grouped = new Map<string, { type: string; repos: GitHubRepo[] }>();

  for (const repo of repos) {
    const key = repo.owner.login;
    if (!grouped.has(key)) {
      grouped.set(key, { type: repo.owner.type, repos: [] });
    }
    grouped.get(key)!.repos.push(repo);
  }

  const entries = Array.from(grouped.entries()).map(([owner, data]) => {
    const sorted = data.repos.sort(
      (a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime(),
    );
    return {
      owner,
      type: data.type,
      active: sorted.filter((r) => !r.archived),
      archived: sorted.filter((r) => r.archived),
    };
  });

  entries.sort((a, b) => {
    if (a.owner === username) return -1;
    if (b.owner === username) return 1;
    return a.owner.localeCompare(b.owner);
  });

  return entries;
}

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
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 sm:px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">markbase</h1>
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
        {/* Synced repos */}
        {syncedRepos.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Synced repos</h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {syncedRepos.length} synced
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
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
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
  );
}

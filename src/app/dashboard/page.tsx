import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSyncedRepos } from "@/lib/synced-repos";
import { SyncButton } from "./sync-button";

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

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RepoCard({ repo, synced }: { repo: GitHubRepo; synced: boolean }) {
  const hasStats =
    repo.stargazers_count > 0 ||
    repo.forks_count > 0 ||
    repo.open_issues_count > 0 ||
    repo.watchers_count > 0;

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-zinc-200 px-5 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 ${
        repo.archived ? "opacity-60" : ""
      }`}
    >
      {/* Row 1: Name + badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            {repo.name}
          </a>
          {repo.private && (
            <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
              private
            </span>
          )}
          {repo.archived && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400">
              archived
            </span>
          )}
        </div>
        <SyncButton repoFullName={repo.full_name} synced={synced} />
      </div>

      {/* Row 2: Description */}
      {repo.description && (
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {repo.description}
        </p>
      )}

      {/* Row 3: Language + branch */}
      <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
        {repo.language && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-current" />
            {repo.language}
          </span>
        )}
        <span>{repo.default_branch}</span>
      </div>

      {/* Row 4: Stats (only if any > 0) */}
      {hasStats && (
        <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          {repo.stargazers_count > 0 && (
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
              </svg>
              {repo.stargazers_count}
            </span>
          )}
          {repo.forks_count > 0 && (
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-.878a2.25 2.25 0 111.5 0v.878a2.25 2.25 0 01-2.25 2.25h-1.5v2.128a2.251 2.251 0 11-1.5 0V8.5h-1.5A2.25 2.25 0 013.5 6.25v-.878a2.25 2.25 0 111.5 0zM5 3.25a.75.75 0 10-1.5 0 .75.75 0 001.5 0zm6.75.75a.75.75 0 10 0-1.5.75.75 0 000 1.5zM8 12.75a.75.75 0 10 0-1.5.75.75 0 000 1.5z" />
              </svg>
              {repo.forks_count}
            </span>
          )}
          {repo.open_issues_count > 0 && (
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              </svg>
              {repo.open_issues_count}
            </span>
          )}
          {repo.watchers_count > 0 && (
            <span className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 010-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2zM1.679 7.932a.12.12 0 000 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 000-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717zM8 10a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
              {repo.watchers_count}
            </span>
          )}
        </div>
      )}

      {/* Row 5: Topics */}
      {repo.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {repo.topics.map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* Row 6: Footer metadata */}
      <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <span>Pushed {timeAgo(repo.pushed_at)}</span>
        <span>·</span>
        <span>Created {formatDate(repo.created_at)}</span>
        <span>·</span>
        <span>{formatSize(repo.size)}</span>
      </div>
    </div>
  );
}

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const [repos, username, syncedRepos] = await Promise.all([
    getRepos(session.accessToken),
    getUsername(session.accessToken),
    getSyncedRepos(),
  ]);

  const syncedSet = new Set(syncedRepos);
  const groups = groupRepos(repos, username);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">markbase</h1>
        <div className="flex items-center gap-4">
          {syncedRepos.length > 0 && (
            <Link
              href="/repos"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              View synced repos
            </Link>
          )}
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {session.user?.name}
          </span>
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

      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your repositories</h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {repos.length} repos
          </span>
        </div>

        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <section key={group.owner}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {group.owner}
                </h3>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {group.type === "Organization" ? "org" : "personal"}
                  {" · "}
                  {group.active.length + group.archived.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {group.active.map((repo) => (
                  <RepoCard key={repo.id} repo={repo} synced={syncedSet.has(repo.full_name)} />
                ))}
              </div>
              {group.archived.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
                    {group.archived.length} archived{" "}
                    {group.archived.length === 1 ? "repo" : "repos"}
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {group.archived.map((repo) => (
                      <RepoCard key={repo.id} repo={repo} synced={syncedSet.has(repo.full_name)} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

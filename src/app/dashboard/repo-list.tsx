"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { timeAgo, formatSize } from "@/lib/format";
import { LANGUAGE_COLORS } from "@/lib/dashboard";
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

interface RepoGroup {
  owner: string;
  type: string;
  active: GitHubRepo[];
  archived: GitHubRepo[];
}

function RepoCard({ repo, synced }: { repo: GitHubRepo; synced: boolean }) {
  const hasStats =
    repo.stargazers_count > 0 ||
    repo.forks_count > 0 ||
    repo.open_issues_count > 0 ||
    repo.watchers_count > 0;

  return (
    <div
      className={`group/card flex flex-col gap-3 rounded-lg border border-zinc-200 px-5 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 ${
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

      {/* Row 3: Language + pushed time */}
      <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
        {repo.language && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: LANGUAGE_COLORS[repo.language] || "#6b7280" }}
            />
            {repo.language}
          </span>
        )}
        <span>Pushed {timeAgo(repo.pushed_at)}</span>
        <span className="hidden sm:inline">{formatSize(repo.size)}</span>
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

    </div>
  );
}

function matchesSearch(repo: GitHubRepo, query: string): boolean {
  const q = query.toLowerCase();
  if (repo.name.toLowerCase().includes(q)) return true;
  if (repo.description?.toLowerCase().includes(q)) return true;
  if (repo.topics.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

interface RepoListProps {
  syncedRepos: string[];
}

const PAGE_SIZE = 20;

function RepoListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-200 px-5 py-4 dark:border-zinc-800"
        >
          <div className="flex flex-col gap-3">
            <div className="h-5 w-36 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-64 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-32 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RepoList({ syncedRepos }: RepoListProps) {
  const [groups, setGroups] = useState<RepoGroup[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const syncedSet = useMemo(() => new Set(syncedRepos), [syncedRepos]);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/repos");
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups);
      setTotalCount(data.totalCount);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch repos when user expands the section
  useEffect(() => {
    if (expanded && !groups) {
      loadRepos();
    }
  }, [expanded, groups, loadRepos]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!search.trim()) return groups;

    return groups
      .map((group) => ({
        ...group,
        active: group.active.filter((r) => matchesSearch(r, search)),
        archived: group.archived.filter((r) => matchesSearch(r, search)),
      }))
      .filter((group) => group.active.length > 0 || group.archived.length > 0);
  }, [groups, search]);

  const filteredCount = filteredGroups.reduce(
    (sum, g) => sum + g.active.length + g.archived.length,
    0,
  );

  // Paginate: flatten active repos, slice to visibleCount, rebuild groups
  const paginatedGroups = useMemo(() => {
    let remaining = visibleCount;
    return filteredGroups.map((group) => {
      if (remaining <= 0) {
        return { ...group, active: [], archived: [] };
      }
      const active = group.active.slice(0, remaining);
      remaining -= active.length;
      return { ...group, active, archived: remaining > 0 ? group.archived : [] };
    }).filter((g) => g.active.length > 0 || g.archived.length > 0);
  }, [filteredGroups, visibleCount]);

  const hasMore = filteredCount > visibleCount;

  // Collapsed state — show the "Add repo" button
  if (!expanded) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-6 py-8 dark:border-zinc-700">
        <h2 className="text-base font-semibold">Add a repository</h2>
        <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
          Browse your GitHub repos and add them to your workspace.
        </p>
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Browse repositories
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">All repositories</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {loading
              ? "Loading..."
              : search.trim()
                ? `${filteredCount} of ${totalCount} repos`
                : `${totalCount} repos`}
          </span>
          <button
            onClick={() => setExpanded(false)}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Collapse
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm pb-4">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder="Search repositories..."
            className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#86D5F4] focus:outline-none focus:ring-1 focus:ring-[#86D5F4] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-[#86D5F4] dark:focus:ring-[#86D5F4]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              aria-label="Clear search"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <RepoListSkeleton />
      ) : paginatedGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          No repositories match &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {paginatedGroups.map((group) => (
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
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    synced={syncedSet.has(repo.full_name)}
                  />
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
                      <RepoCard
                        key={repo.id}
                        repo={repo}
                        synced={syncedSet.has(repo.full_name)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </section>
          ))}

          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="mx-auto rounded-lg border border-zinc-200 px-6 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Show more ({filteredCount - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </>
  );
}

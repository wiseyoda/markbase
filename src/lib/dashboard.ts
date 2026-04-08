import { githubApiUrl } from "./github-config";
import { getGitHubRepoTags } from "./github-cache";
export { LANGUAGE_COLORS } from "./language-colors";

export interface GitHubRepo {
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

export interface RepoGroup {
  owner: string;
  type: string;
  active: GitHubRepo[];
  archived: GitHubRepo[];
}

function parseLastPage(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return match ? Number(match[1]) : null;
}

export async function getRepos(accessToken: string): Promise<GitHubRepo[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Fetch first page to get pagination info
  const firstRes = await fetch(
    githubApiUrl("/user/repos?per_page=100&sort=pushed&page=1"),
    {
      cache: "force-cache",
      headers,
      next: { revalidate: 60 },
    },
  );
  if (!firstRes.ok) return [];

  const firstBatch: GitHubRepo[] = await firstRes.json();
  if (firstBatch.length < 100) return firstBatch;

  // Parse Link header to determine total pages, then fetch remaining in parallel
  const lastPage = parseLastPage(firstRes.headers.get("link"));
  if (!lastPage || lastPage <= 1) return firstBatch;

  const remaining = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) =>
      fetch(
        githubApiUrl(`/user/repos?per_page=100&sort=pushed&page=${i + 2}`),
        {
          cache: "force-cache",
          headers,
          next: { revalidate: 60 },
        },
      ).then((res) => (res.ok ? (res.json() as Promise<GitHubRepo[]>) : [])),
    ),
  );

  return [firstBatch, ...remaining].flat();
}

export async function getUsername(accessToken: string): Promise<string> {
  const res = await fetch(githubApiUrl("/user"), {
    cache: "force-cache",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
    next: { revalidate: 300 },
  });
  const user = await res.json();
  return user.login;
}

/** Fetch metadata for a small set of repos by full_name (e.g. pinned repos). */
export async function getReposByName(
  accessToken: string,
  fullNames: string[],
): Promise<GitHubRepo[]> {
  if (fullNames.length === 0) return [];

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
  };

  const results = await Promise.all(
    fullNames.map((name) =>
      {
        const [owner, repo] = name.split("/");
        return fetch(githubApiUrl(`/repos/${name}`), {
          cache: "force-cache",
          headers,
          next: {
            revalidate: 60,
            tags: getGitHubRepoTags(owner, repo),
          },
        }).then((res) => (res.ok ? (res.json() as Promise<GitHubRepo>) : null));
      }
    ),
  );

  return results.filter((r): r is GitHubRepo => r !== null);
}

export function groupRepos(
  repos: GitHubRepo[],
  username: string,
): RepoGroup[] {
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
      (a, b) =>
        new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime(),
    );
    return {
      owner,
      type: data.type,
      active: sorted.filter((repo) => !repo.archived),
      archived: sorted.filter((repo) => repo.archived),
    };
  });

  entries.sort((a, b) => {
    if (a.owner === username) return -1;
    if (b.owner === username) return 1;
    return a.owner.localeCompare(b.owner);
  });

  return entries;
}

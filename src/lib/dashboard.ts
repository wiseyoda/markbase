import { githubApiUrl } from "./github-config";

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

export async function getRepos(accessToken: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      githubApiUrl(`/user/repos?per_page=100&sort=pushed&page=${page}`),
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

export async function getUsername(accessToken: string): Promise<string> {
  const res = await fetch(githubApiUrl("/user"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
    next: { revalidate: 300 },
  });
  const user = await res.json();
  return user.login;
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

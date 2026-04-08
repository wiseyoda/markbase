import { githubApiUrl } from "./github-config";

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  Shell: "#89e051",
  Dart: "#00B4AB",
  Scala: "#c22d40",
  Lua: "#000080",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  R: "#198CE7",
  Vue: "#41b883",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Markdown: "#083fa1",
  Dockerfile: "#384d54",
  HCL: "#844FBA",
  Nix: "#7e7eff",
  Zig: "#ec915c",
  OCaml: "#3be133",
};

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
    { headers, next: { revalidate: 60 } },
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
        { headers, next: { revalidate: 60 } },
      ).then((res) => (res.ok ? (res.json() as Promise<GitHubRepo[]>) : [])),
    ),
  );

  return [firstBatch, ...remaining].flat();
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
      fetch(githubApiUrl(`/repos/${name}`), {
        headers,
        next: { revalidate: 60 },
      }).then((res) => (res.ok ? (res.json() as Promise<GitHubRepo>) : null)),
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

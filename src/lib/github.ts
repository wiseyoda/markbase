import { githubApiUrl } from "./github-config";
import {
  getGitHubBranchTags,
  getGitHubCommitFileTags,
  getGitHubFileHistoryTags,
  getGitHubFileTags,
  getGitHubRepoTags,
} from "./github-cache";

interface TreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface MarkdownFile {
  path: string;
  sha: string;
}

/**
 * Fetches the default branch name for a GitHub repository.
 * @returns The repository's default branch, or `"main"` if the API request
 *   fails (network error, auth failure, rate limit). Callers should be aware
 *   the returned value may not reflect the actual default branch on failure.
 */
export async function getDefaultBranch(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string> {
  const res = await fetch(
    githubApiUrl(`/repos/${owner}/${repo}`),
    {
      cache: "force-cache",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: {
        revalidate: 300,
        tags: getGitHubRepoTags(owner, repo),
      },
    },
  );

  if (!res.ok) return "main";
  const data = await res.json();
  return data.default_branch;
}

export async function getMarkdownTree(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<MarkdownFile[]> {
  const res = await fetch(
    githubApiUrl(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`),
    {
      cache: "force-cache",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: {
        revalidate: 60,
        tags: getGitHubBranchTags(owner, repo, branch),
      },
    },
  );

  if (!res.ok) return [];

  const data = await res.json();
  const tree = Array.isArray(data?.tree) ? (data.tree as TreeItem[]) : [];
  return tree
    .filter((item) => item.type === "blob" && item.path.endsWith(".md"))
    .map((item) => ({ path: item.path, sha: item.sha }));
}

export async function getFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(
    githubApiUrl(
      `/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${branch}`,
    ),
    {
      cache: "force-cache",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.raw+json",
      },
      next: {
        revalidate: 60,
        tags: getGitHubFileTags(owner, repo, branch, path),
      },
    },
  );

  if (!res.ok) return null;
  return res.text();
}

export interface FileCommit {
  sha: string;
  message: string;
  date: string;
  author: {
    login: string;
    avatar_url: string;
  };
}

export async function getFileHistory(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<FileCommit[]> {
  // History is read-through on every SSR: we need to know the real latest
  // commit sha to decide which blob to render, so caching it at all defeats
  // the "new commit shows up immediately" semantics the viewer relies on.
  // The actual file content is commit-scoped and still cached eternally via
  // getFileAtCommit, so the extra per-view round trip only hits this cheap
  // commits-list endpoint.
  const res = await fetch(
    githubApiUrl(
      `/repos/${owner}/${repo}/commits?sha=${branch}&path=${encodeURIComponent(path)}&per_page=30`,
    ),
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: {
        tags: getGitHubFileHistoryTags(owner, repo, branch, path),
      },
    },
  );

  if (!res.ok) return [];
  const data = await res.json();
  return (data as Record<string, unknown>[]).map((c) => {
    const commit = c.commit as Record<string, unknown>;
    const author = commit.author as Record<string, unknown>;
    const ghAuthor = c.author as Record<string, unknown> | null;
    return {
      sha: c.sha as string,
      message: (commit.message as string).split("\n")[0],
      date: author.date as string,
      author: {
        login: ghAuthor?.login as string || "unknown",
        avatar_url: ghAuthor?.avatar_url as string || "",
      },
    };
  });
}

export async function getLastModified(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(
    githubApiUrl(
      `/repos/${owner}/${repo}/commits?sha=${branch}&path=${encodeURIComponent(path)}&per_page=1`,
    ),
    {
      cache: "force-cache",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: {
        revalidate: 60,
        tags: getGitHubFileHistoryTags(owner, repo, branch, path),
      },
    },
  );

  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const commit = data[0].commit as Record<string, unknown>;
  const author = commit.author as Record<string, unknown>;
  return author.date as string;
}

export async function getFileAtCommit(
  accessToken: string,
  owner: string,
  repo: string,
  sha: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(
    githubApiUrl(`/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${sha}`),
    {
      cache: "force-cache",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.raw+json",
      },
      next: {
        revalidate: 300,
        tags: getGitHubCommitFileTags(owner, repo, sha, path),
      },
    },
  );

  if (!res.ok) return null;
  return res.text();
}

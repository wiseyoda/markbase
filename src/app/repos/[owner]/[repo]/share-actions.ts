"use server";

import { auth } from "@/auth";
import { createShare, deleteShare } from "@/lib/shares";
import { withDbRetry } from "@/lib/db";
import { githubApiUrl } from "@/lib/github-config";

export interface GitHubUserResult {
  login: string;
  id: number;
  avatar_url: string;
}

export async function createShareAction(opts: {
  type: "file" | "repo" | "folder";
  repo: string;
  branch: string;
  filePath: string | null;
  expiresIn: string | null;
  sharedWith: string | null;
  sharedWithName: string | null;
}): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  return withDbRetry(() =>
    createShare({
      type: opts.type,
      ownerId: session.user.id,
      repo: opts.repo,
      branch: opts.branch,
      filePath: opts.filePath,
      accessToken: session.accessToken,
      expiresIn: opts.expiresIn,
      sharedWith: opts.sharedWith,
      sharedWithName: opts.sharedWithName,
    }),
  );
}

export async function deleteShareAction(
  shareId: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return withDbRetry(() => deleteShare(shareId, session.user.id));
}

export async function searchGitHubUsers(
  query: string,
): Promise<GitHubUserResult[]> {
  const session = await auth();
  if (!session?.accessToken || !query.trim()) return [];

  // Search local users first (people who have signed in to markbase)
  const { searchUsers } = await import("@/lib/users");
  const localUsers = await searchUsers(query);
  const localResults: GitHubUserResult[] = localUsers.map((u) => ({
    login: u.login,
    id: Number(u.id),
    avatar_url: u.avatar_url || "",
  }));

  // Then search GitHub for additional results
  const res = await fetch(
    githubApiUrl(
      `/search/users?q=${encodeURIComponent(query)}&per_page=5`,
    ),
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  let githubResults: GitHubUserResult[] = [];
  if (res.ok) {
    const data = await res.json();
    githubResults = (data.items || []).map((u: Record<string, unknown>) => ({
      login: u.login as string,
      id: u.id as number,
      avatar_url: u.avatar_url as string,
    }));
  }

  // Dedupe: local users first, then GitHub results not in local
  const localIds = new Set(localResults.map((u) => u.id));
  const combined = [
    ...localResults,
    ...githubResults.filter((u) => !localIds.has(u.id)),
  ];

  return combined.slice(0, 8);
}

"use server";

import { auth } from "@/auth";
import { createShare, deleteShare } from "@/lib/shares";

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

  return createShare({
    type: opts.type,
    ownerId: session.user.id,
    repo: opts.repo,
    branch: opts.branch,
    filePath: opts.filePath,
    accessToken: session.accessToken,
    expiresIn: opts.expiresIn,
    sharedWith: opts.sharedWith,
    sharedWithName: opts.sharedWithName,
  });
}

export async function deleteShareAction(
  shareId: string,
  repoOwner?: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const isOwner = repoOwner
    ? session.user?.name?.toLowerCase() === repoOwner.toLowerCase()
    : false;
  return deleteShare(shareId, session.user.id, isOwner);
}

export async function searchGitHubUsers(
  query: string,
): Promise<GitHubUserResult[]> {
  const session = await auth();
  if (!session?.accessToken || !query.trim()) return [];

  const res = await fetch(
    `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=5`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((u: Record<string, unknown>) => ({
    login: u.login as string,
    id: u.id as number,
    avatar_url: u.avatar_url as string,
  }));
}

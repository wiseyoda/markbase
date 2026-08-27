"use server";

import { auth } from "@/auth";
import { createShare, deleteShare } from "@/lib/shares";
import { withDbRetry } from "@/lib/db";
import { githubApiUrl } from "@/lib/github-config";
import { authorizeResourceAccess } from "@/lib/resource-access";
import { getFileContent } from "@/lib/github";
import { computeBlobSha } from "@/lib/file-summaries";

export interface GitHubUserResult {
  login: string;
  id: number;
  avatar_url: string;
}

const SHARE_TYPES = new Set(["file", "repo", "folder"]);
const SHARE_EXPIRIES = new Set(["1h", "1d", "7d", "30d"]);
const MAX_FILE_SNAPSHOT_BYTES = 1_000_000;

async function verifyShareRecipient(
  accessToken: string,
  userId: string,
  login: string,
): Promise<void> {
  if (!/^\d+$/.test(userId) || !/^[A-Za-z0-9-]{1,39}$/.test(login)) {
    throw new Error("Invalid share recipient");
  }
  const response = await fetch(githubApiUrl(`/user/${userId}`), {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error("Invalid share recipient");
  const user = (await response.json()) as { id?: number; login?: string };
  if (
    String(user.id) !== userId ||
    user.login?.toLowerCase() !== login.toLowerCase()
  ) {
    throw new Error("Invalid share recipient");
  }
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
  if (!SHARE_TYPES.has(opts.type)) throw new Error("Invalid share type");
  if (opts.expiresIn !== null && !SHARE_EXPIRIES.has(opts.expiresIn)) {
    throw new Error("Invalid share expiry");
  }
  if (opts.type !== "repo" && !opts.filePath) {
    throw new Error("A file path is required for file and folder shares");
  }
  if (opts.type === "repo" && opts.filePath !== null) {
    throw new Error("Repository shares cannot include a file path");
  }
  if (Boolean(opts.sharedWith) !== Boolean(opts.sharedWithName)) {
    throw new Error("Share recipient ID and name must be provided together");
  }
  const access = await authorizeResourceAccess(
    {
      repo: opts.repo,
      branch: opts.branch,
      path: opts.type === "repo" ? null : opts.filePath,
    },
    { requireUser: true },
  );
  if (!access.actorId) throw new Error("Not authenticated");
  if (opts.sharedWith && opts.sharedWithName) {
    await verifyShareRecipient(
      access.accessToken,
      opts.sharedWith,
      opts.sharedWithName,
    );
  }

  let snapshotContent: string | null = null;
  let snapshotSha: string | null = null;
  if (opts.type === "file" && opts.filePath) {
    const [owner, repo] = opts.repo.split("/");
    snapshotContent = await getFileContent(
      access.accessToken,
      owner,
      repo,
      opts.branch,
      opts.filePath,
    );
    if (snapshotContent === null) {
      throw new Error("The shared file could not be read");
    }
    if (Buffer.byteLength(snapshotContent, "utf8") > MAX_FILE_SNAPSHOT_BYTES) {
      throw new Error("The shared file exceeds the 1 MB snapshot limit");
    }
    snapshotSha = computeBlobSha(snapshotContent);
  }

  return withDbRetry(() =>
    createShare({
      type: opts.type,
      ownerId: access.actorId!,
      repo: opts.repo,
      branch: opts.branch,
      filePath: opts.filePath,
      accessToken: opts.type === "file" ? null : access.accessToken,
      snapshotContent,
      snapshotSha,
      repoPrivate: access.repositoryPrivate,
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

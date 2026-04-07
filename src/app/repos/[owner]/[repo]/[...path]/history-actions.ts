"use server";

import { auth } from "@/auth";
import { getFileHistory, getFileAtCommit } from "@/lib/github";
import type { FileCommit } from "@/lib/github";

export async function fetchFileHistory(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<FileCommit[]> {
  const session = await auth();
  if (!session?.accessToken) return [];
  return getFileHistory(session.accessToken, owner, repo, branch, filePath);
}

export async function fetchFileAtCommit(
  owner: string,
  repo: string,
  sha: string,
  filePath: string,
): Promise<string | null> {
  const session = await auth();
  if (!session?.accessToken) return null;
  return getFileAtCommit(session.accessToken, owner, repo, sha, filePath);
}

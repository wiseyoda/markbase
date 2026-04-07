"use server";

import { auth } from "@/auth";
import { getFileHistory, getFileAtCommit } from "@/lib/github";
import { getShare } from "@/lib/shares";
import type { FileCommit } from "@/lib/github";

async function resolveToken(shareId?: string): Promise<string | null> {
  if (shareId) {
    const share = await getShare(shareId);
    if (share?.accessToken) return share.accessToken;
  }
  const session = await auth();
  return session?.accessToken || null;
}

export async function fetchFileHistory(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  shareId?: string,
): Promise<FileCommit[]> {
  const token = await resolveToken(shareId);
  if (!token) return [];
  return getFileHistory(token, owner, repo, branch, filePath);
}

export async function fetchFileAtCommit(
  owner: string,
  repo: string,
  sha: string,
  filePath: string,
  shareId?: string,
): Promise<string | null> {
  const token = await resolveToken(shareId);
  if (!token) return null;
  return getFileAtCommit(token, owner, repo, sha, filePath);
}

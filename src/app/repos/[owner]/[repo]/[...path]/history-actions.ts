"use server";

import { getFileHistory, getFileAtCommit } from "@/lib/github";
import type { FileCommit } from "@/lib/github";
import {
  authorizeResourceAccess,
  ResourceAccessError,
} from "@/lib/resource-access";

export async function fetchFileHistory(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  shareId?: string,
): Promise<FileCommit[]> {
  const access = await authorizeResourceAccess(
    { repo: `${owner}/${repo}`, branch, path: filePath },
    { shareId },
  );
  if (!access.accessToken) {
    throw new ResourceAccessError("History is unavailable for snapshot shares");
  }
  return getFileHistory(access.accessToken, owner, repo, branch, filePath);
}

export async function fetchFileAtCommit(
  owner: string,
  repo: string,
  branch: string,
  sha: string,
  filePath: string,
  shareId?: string,
): Promise<string | null> {
  const access = await authorizeResourceAccess(
    { repo: `${owner}/${repo}`, branch, path: filePath },
    { shareId },
  );
  if (!access.accessToken) {
    throw new ResourceAccessError("History is unavailable for snapshot shares");
  }
  const authorizedHistory = await getFileHistory(
    access.accessToken,
    owner,
    repo,
    branch,
    filePath,
  );
  if (!authorizedHistory.some((commit) => commit.sha === sha)) {
    throw new ResourceAccessError();
  }
  return getFileAtCommit(access.accessToken, owner, repo, sha, filePath);
}

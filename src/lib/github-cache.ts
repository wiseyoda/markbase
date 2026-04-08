import { createHash } from "node:crypto";
import { revalidateTag, updateTag } from "next/cache";

const TAG_PREFIX = "markbase-gh-v1";

function buildTag(kind: string, parts: string[]): string {
  const hash = createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 24);

  return `${TAG_PREFIX}:${kind}:${hash}`;
}

function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags));
}

export function getGitHubRepoTag(owner: string, repo: string): string {
  return buildTag("repo", [owner, repo]);
}

export function getGitHubBranchTag(
  owner: string,
  repo: string,
  branch: string,
): string {
  return buildTag("branch", [owner, repo, branch]);
}

export function getGitHubFileTag(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string {
  return buildTag("file", [owner, repo, branch, path]);
}

export function getGitHubFileHistoryTag(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string {
  return buildTag("history", [owner, repo, branch, path]);
}

export function getGitHubCommitFileTag(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string {
  return buildTag("commit-file", [owner, repo, sha, path]);
}

export function getGitHubRepoTags(owner: string, repo: string): string[] {
  return [getGitHubRepoTag(owner, repo)];
}

export function getGitHubBranchTags(
  owner: string,
  repo: string,
  branch: string,
): string[] {
  return dedupeTags([
    getGitHubRepoTag(owner, repo),
    getGitHubBranchTag(owner, repo, branch),
  ]);
}

export function getGitHubFileTags(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string[] {
  return dedupeTags([
    ...getGitHubBranchTags(owner, repo, branch),
    getGitHubFileTag(owner, repo, branch, path),
  ]);
}

export function getGitHubFileHistoryTags(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string[] {
  return dedupeTags([
    ...getGitHubBranchTags(owner, repo, branch),
    getGitHubFileHistoryTag(owner, repo, branch, path),
  ]);
}

export function getGitHubCommitFileTags(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string[] {
  return [getGitHubCommitFileTag(owner, repo, sha, path)];
}

export function getGitHubDocumentRefreshTags(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string[] {
  return dedupeTags([
    ...getGitHubFileTags(owner, repo, branch, path),
    ...getGitHubFileHistoryTags(owner, repo, branch, path),
  ]);
}

export function refreshGitHubDocumentCache(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): void {
  for (const tag of getGitHubDocumentRefreshTags(owner, repo, branch, path)) {
    updateTag(tag);
  }
}

export function expireGitHubBranchCache(
  owner: string,
  repo: string,
  branch: string,
): void {
  for (const tag of getGitHubBranchTags(owner, repo, branch)) {
    revalidateTag(tag, { expire: 0 });
  }
}

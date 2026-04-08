// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTagMock, updateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  updateTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
  updateTag: updateTagMock,
}));

import {
  expireGitHubBranchCache,
  getGitHubBranchTag,
  getGitHubBranchTags,
  getGitHubCommitFileTags,
  getGitHubDocumentRefreshTags,
  getGitHubFileHistoryTag,
  getGitHubFileTag,
  getGitHubRepoTag,
  refreshGitHubDocumentCache,
} from "@/lib/github-cache";

describe("github cache helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stable tags for repo, branch, file, and history keys", () => {
    expect(getGitHubRepoTag("owner", "repo")).toMatch(/^markbase-gh-v1:repo:/);
    expect(getGitHubBranchTag("owner", "repo", "main")).toMatch(
      /^markbase-gh-v1:branch:/,
    );
    expect(getGitHubFileTag("owner", "repo", "main", "docs/README.md")).toMatch(
      /^markbase-gh-v1:file:/,
    );
    expect(
      getGitHubFileHistoryTag("owner", "repo", "main", "docs/README.md"),
    ).toMatch(/^markbase-gh-v1:history:/);

    expect(getGitHubRepoTag("owner", "repo")).toBe(
      getGitHubRepoTag("owner", "repo"),
    );
    expect(getGitHubBranchTag("owner", "repo", "main")).not.toBe(
      getGitHubBranchTag("owner", "repo", "trunk"),
    );
  });

  it("returns deduped tag sets for fetches and document refreshes", () => {
    const branchTags = getGitHubBranchTags("owner", "repo", "main");
    expect(branchTags).toEqual([
      getGitHubRepoTag("owner", "repo"),
      getGitHubBranchTag("owner", "repo", "main"),
    ]);

    const refreshTags = getGitHubDocumentRefreshTags(
      "owner",
      "repo",
      "main",
      "docs/README.md",
    );

    expect(refreshTags).toEqual([
      getGitHubRepoTag("owner", "repo"),
      getGitHubBranchTag("owner", "repo", "main"),
      getGitHubFileTag("owner", "repo", "main", "docs/README.md"),
      getGitHubFileHistoryTag("owner", "repo", "main", "docs/README.md"),
    ]);

    expect(getGitHubCommitFileTags("owner", "repo", "abc123", "README.md")).toHaveLength(1);
  });

  it("updates tags for the current document refresh", () => {
    refreshGitHubDocumentCache("owner", "repo", "main", "docs/README.md");

    expect(updateTagMock).toHaveBeenCalledTimes(4);
    expect(updateTagMock).toHaveBeenNthCalledWith(
      1,
      getGitHubRepoTag("owner", "repo"),
    );
    expect(updateTagMock).toHaveBeenNthCalledWith(
      2,
      getGitHubBranchTag("owner", "repo", "main"),
    );
    expect(updateTagMock).toHaveBeenNthCalledWith(
      3,
      getGitHubFileTag("owner", "repo", "main", "docs/README.md"),
    );
    expect(updateTagMock).toHaveBeenNthCalledWith(
      4,
      getGitHubFileHistoryTag("owner", "repo", "main", "docs/README.md"),
    );
  });

  it("expires branch-level cache tags for webhook invalidation", () => {
    expireGitHubBranchCache("owner", "repo", "main");

    expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    expect(revalidateTagMock).toHaveBeenNthCalledWith(
      1,
      getGitHubRepoTag("owner", "repo"),
      { expire: 0 },
    );
    expect(revalidateTagMock).toHaveBeenNthCalledWith(
      2,
      getGitHubBranchTag("owner", "repo", "main"),
      { expire: 0 },
    );
  });
});

// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultBranch,
  getFileAtCommit,
  getFileContent,
  getFileHistory,
  getLastModified,
  getMarkdownTree,
} from "@/lib/github";
import {
  getGitHubBranchTags,
  getGitHubCommitFileTags,
  getGitHubFileHistoryTags,
  getGitHubFileTags,
  getGitHubRepoTags,
} from "@/lib/github-cache";

describe("github API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches default branches with a fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: "trunk" }),
      })
      .mockResolvedValueOnce({ ok: false });

    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await expect(getDefaultBranch("token", "owner", "repo")).resolves.toBe(
      "trunk",
    );
    await expect(getDefaultBranch("token", "owner", "repo")).resolves.toBe(
      "main",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/owner/repo",
      expect.objectContaining({
        cache: "force-cache",
        next: {
          revalidate: 300,
          tags: getGitHubRepoTags("owner", "repo"),
        },
      }),
    );
  });

  it("filters markdown files", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tree: [
          { path: "README.md", sha: "1", type: "blob" },
          { path: "notes.txt", sha: "2", type: "blob" },
          { path: "docs", sha: "3", type: "tree" },
        ],
      }),
    });

    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await expect(
      getMarkdownTree("token", "owner", "repo", "main"),
    ).resolves.toEqual([{ path: "README.md", sha: "1" }]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
      expect.objectContaining({
        cache: "force-cache",
        next: {
          revalidate: 60,
          tags: getGitHubBranchTags("owner", "repo", "main"),
        },
      }),
    );
  });

  it("returns an empty markdown tree for malformed payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tree: null }),
      }),
    );

    await expect(
      getMarkdownTree("token", "owner", "repo", "main"),
    ).resolves.toEqual([]);
  });

  it("returns file content and commit metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "# README",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            sha: "abc",
            commit: {
              message: "Subject\n\nBody",
              author: { date: "2026-01-01T00:00:00.000Z" },
            },
            author: {
              login: "owner-user",
              avatar_url: "https://example.com/owner.png",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            commit: {
              author: { date: "2026-01-01T00:00:00.000Z" },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "# Old README",
      });

    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await expect(
      getFileContent("token", "owner", "repo", "main", "README.md"),
    ).resolves.toBe("# README");
    await expect(
      getFileHistory("token", "owner", "repo", "main", "README.md"),
    ).resolves.toEqual([
      {
        sha: "abc",
        message: "Subject",
        date: "2026-01-01T00:00:00.000Z",
        author: {
          login: "owner-user",
          avatar_url: "https://example.com/owner.png",
        },
      },
    ]);
    await expect(
      getLastModified("token", "owner", "repo", "main", "README.md"),
    ).resolves.toBe("2026-01-01T00:00:00.000Z");
    await expect(
      getFileAtCommit("token", "owner", "repo", "abc", "README.md"),
    ).resolves.toBe("# Old README");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/owner/repo/contents/README.md?ref=main",
      expect.objectContaining({
        cache: "force-cache",
        next: {
          revalidate: 60,
          tags: getGitHubFileTags("owner", "repo", "main", "README.md"),
        },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/owner/repo/commits?sha=main&path=README.md&per_page=30",
      expect.objectContaining({
        cache: "force-cache",
        next: {
          revalidate: 60,
          tags: getGitHubFileHistoryTags("owner", "repo", "main", "README.md"),
        },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/owner/repo/commits?sha=main&path=README.md&per_page=1",
      expect.objectContaining({
        cache: "force-cache",
        next: {
          revalidate: 60,
          tags: getGitHubFileHistoryTags("owner", "repo", "main", "README.md"),
        },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.github.com/repos/owner/repo/contents/README.md?ref=abc",
      expect.objectContaining({
        cache: "force-cache",
        next: {
          revalidate: 300,
          tags: getGitHubCommitFileTags("owner", "repo", "abc", "README.md"),
        },
      }),
    );
  });

  it("defaults missing commit authors and empty histories", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              sha: "abc",
              commit: {
                message: "Subject",
                author: { date: "2026-01-01T00:00:00.000Z" },
              },
              author: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }),
    );

    await expect(
      getFileHistory("token", "owner", "repo", "main", "README.md"),
    ).resolves.toEqual([
      {
        sha: "abc",
        message: "Subject",
        date: "2026-01-01T00:00:00.000Z",
        author: {
          login: "unknown",
          avatar_url: "",
        },
      },
    ]);
    await expect(
      getLastModified("token", "owner", "repo", "main", "README.md"),
    ).resolves.toBeNull();
  });

  it("handles failed GitHub responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({ ok: false }),
    );

    await expect(
      getFileContent("token", "owner", "repo", "main", "README.md"),
    ).resolves.toBeNull();
    await expect(
      getFileHistory("token", "owner", "repo", "main", "README.md"),
    ).resolves.toEqual([]);
    await expect(
      getLastModified("token", "owner", "repo", "main", "README.md"),
    ).resolves.toBeNull();
    await expect(
      getMarkdownTree("token", "owner", "repo", "main"),
    ).resolves.toEqual([]);
    await expect(
      getFileAtCommit("token", "owner", "repo", "abc", "README.md"),
    ).resolves.toBeNull();
  });
});

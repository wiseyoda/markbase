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

describe("github API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches default branches with a fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ default_branch: "trunk" }),
        })
        .mockResolvedValueOnce({ ok: false }),
    );

    await expect(getDefaultBranch("token", "owner", "repo")).resolves.toBe(
      "trunk",
    );
    await expect(getDefaultBranch("token", "owner", "repo")).resolves.toBe(
      "main",
    );
  });

  it("filters markdown files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tree: [
            { path: "README.md", sha: "1", type: "blob" },
            { path: "notes.txt", sha: "2", type: "blob" },
            { path: "docs", sha: "3", type: "tree" },
          ],
        }),
      }),
    );

    await expect(
      getMarkdownTree("token", "owner", "repo", "main"),
    ).resolves.toEqual([{ path: "README.md", sha: "1" }]);
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
    vi.stubGlobal(
      "fetch",
      vi
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
        }),
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

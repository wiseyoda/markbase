// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../../helpers/postgres";
import { createShare } from "@/lib/shares";

const { authMock, getFileAtCommitMock, getFileHistoryMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getFileAtCommitMock: vi.fn(),
  getFileHistoryMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/github", () => ({
  getFileHistory: getFileHistoryMock,
  getFileAtCommit: getFileAtCommitMock,
}));

import {
  fetchFileAtCommit,
  fetchFileHistory,
} from "@/app/repos/[owner]/[repo]/[...path]/history-actions";

describe("history actions", () => {
  useTestDatabase();

  beforeEach(() => {
    authMock.mockResolvedValue({
      accessToken: "owner-token",
      user: { id: "1", login: "owner-user" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        const match = url.match(/\/repos\/([^/]+)\/([^/?]+)/);
        const fullName = match
          ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
          : "";
        return new Response(JSON.stringify({ full_name: fullName, permissions: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    getFileHistoryMock.mockResolvedValue([{ sha: "c1" }]);
    getFileAtCommitMock.mockResolvedValue("# README");
  });

  it("fetches history with the session token", async () => {
    await expect(
      fetchFileHistory("owner-user", "notes", "main", "README.md"),
    ).resolves.toEqual([{ sha: "c1" }]);
    await expect(
      fetchFileAtCommit("owner-user", "notes", "main", "c1", "README.md"),
    ).resolves.toBe("# README");
    expect(getFileHistoryMock).toHaveBeenCalledWith(
      "owner-token",
      "owner-user",
      "notes",
      "main",
      "README.md",
    );
  });

  it("prefers share tokens when a share id is provided", async () => {
    const shareId = await createShare({
      type: "file",
      ownerId: "1",
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      accessToken: "share-token",
      expiresIn: null,
      sharedWith: null,
      sharedWithName: null,
    });

    await fetchFileHistory("owner-user", "notes", "main", "README.md", shareId);

    expect(getFileHistoryMock).toHaveBeenCalledWith(
      "share-token",
      "owner-user",
      "notes",
      "main",
      "README.md",
    );
  });

  it("rejects requests when no capability is available", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      fetchFileHistory("owner-user", "notes", "main", "README.md"),
    ).rejects.toThrow("Not authenticated");
    await expect(
      fetchFileAtCommit("owner-user", "notes", "main", "c1", "README.md"),
    ).rejects.toThrow("Not authenticated");
  });

  it("rejects share-token access outside the exact share scope", async () => {
    const shareId = await createShare({
      type: "folder",
      ownerId: "1",
      repo: "owner-user/notes",
      branch: "main",
      filePath: "docs",
      accessToken: "share-token",
      expiresIn: null,
      sharedWith: null,
      sharedWithName: null,
    });

    await expect(
      fetchFileHistory("owner-user", "notes", "main", "docs/guide.md", shareId),
    ).resolves.toEqual([{ sha: "c1" }]);
    await expect(
      fetchFileHistory("owner-user", "other", "main", "docs/guide.md", shareId),
    ).rejects.toThrow("Not authorized");
    await expect(
      fetchFileHistory("owner-user", "notes", "dev", "docs/guide.md", shareId),
    ).rejects.toThrow("Not authorized");
    await expect(
      fetchFileHistory("owner-user", "notes", "main", "private.md", shareId),
    ).rejects.toThrow("Not authorized");
  });
});

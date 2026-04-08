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
      user: { id: "1" },
    });
    getFileHistoryMock.mockResolvedValue([{ sha: "c1" }]);
    getFileAtCommitMock.mockResolvedValue("# README");
  });

  it("fetches history with the session token", async () => {
    await expect(
      fetchFileHistory("owner-user", "notes", "main", "README.md"),
    ).resolves.toEqual([{ sha: "c1" }]);
    await expect(
      fetchFileAtCommit("owner-user", "notes", "c1", "README.md"),
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

  it("returns empty values when no token is available", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      fetchFileHistory("owner-user", "notes", "main", "README.md"),
    ).resolves.toEqual([]);
    await expect(
      fetchFileAtCommit("owner-user", "notes", "c1", "README.md"),
    ).resolves.toBeNull();
  });
});

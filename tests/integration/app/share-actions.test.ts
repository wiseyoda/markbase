// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../../helpers/postgres";
import { createShareAction, deleteShareAction, searchGitHubUsers } from "@/app/repos/[owner]/[repo]/share-actions";

const { authMock, searchUsersMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  searchUsersMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/users", () => ({
  searchUsers: searchUsersMock,
}));

describe("share actions", () => {
  useTestDatabase();

  beforeEach(() => {
    authMock.mockResolvedValue({
      accessToken: "owner-token",
      user: {
        id: "1",
        login: "owner-user",
        name: "Owner User",
      },
    });
    searchUsersMock.mockResolvedValue([
      {
        id: "202",
        login: "recipient-user",
        name: "Recipient User",
        avatar_url: "https://example.com/recipient.png",
      },
    ]);
  });

  it("creates and deletes shares using the authenticated user", async () => {
    const shareId = await createShareAction({
      type: "file",
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      expiresIn: "7d",
      sharedWith: null,
      sharedWithName: null,
    });

    expect(shareId).toHaveLength(12);
    await expect(deleteShareAction(shareId)).resolves.toBe(true);
  });

  it("rejects unauthenticated share deletion", async () => {
    authMock.mockResolvedValue(null);

    await expect(deleteShareAction("share-id")).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("searches local users and GitHub users without duplicates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              login: "recipient-user",
              id: 202,
              avatar_url: "https://example.com/recipient.png",
            },
            {
              login: "reviewer-user",
              id: 303,
              avatar_url: "https://example.com/reviewer.png",
            },
          ],
        }),
      }),
    );

    await expect(searchGitHubUsers("re")).resolves.toEqual([
      {
        login: "recipient-user",
        id: 202,
        avatar_url: "https://example.com/recipient.png",
      },
      {
        login: "reviewer-user",
        id: 303,
        avatar_url: "https://example.com/reviewer.png",
      },
    ]);
  });

  it("rejects unauthenticated share operations", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      createShareAction({
        type: "repo",
        repo: "owner-user/notes",
        branch: "main",
        filePath: null,
        expiresIn: null,
        sharedWith: null,
        sharedWithName: null,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("returns empty results for blank user searches", async () => {
    await expect(searchGitHubUsers("   ")).resolves.toEqual([]);
  });

  it("returns local users when GitHub search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    await expect(searchGitHubUsers("recipient")).resolves.toEqual([
      {
        login: "recipient-user",
        id: 202,
        avatar_url: "https://example.com/recipient.png",
      },
    ]);
  });

  it("returns empty user results when no access token exists", async () => {
    authMock.mockResolvedValue({
      accessToken: "",
      user: {
        id: "1",
        login: "owner-user",
        name: "Owner User",
      },
    });

    await expect(searchGitHubUsers("recipient")).resolves.toEqual([]);
  });

  it("normalizes missing avatars and missing GitHub items", async () => {
    searchUsersMock.mockResolvedValue([
      {
        id: "202",
        login: "recipient-user",
        name: "Recipient User",
        avatar_url: null,
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    await expect(searchGitHubUsers("recipient")).resolves.toEqual([
      {
        login: "recipient-user",
        id: 202,
        avatar_url: "",
      },
    ]);
  });
});

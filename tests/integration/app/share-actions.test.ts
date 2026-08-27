// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../../helpers/postgres";
import { createShareAction, deleteShareAction, searchGitHubUsers } from "@/app/repos/[owner]/[repo]/share-actions";
import { getShare } from "@/lib/shares";

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
    await expect(getShare(shareId)).resolves.toMatchObject({
      accessToken: null,
      snapshotContent: expect.any(String),
      snapshotSha: expect.any(String),
    });
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

  it("rejects share creation for a repository the caller cannot access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
    );

    await expect(
      createShareAction({
        type: "file",
        repo: "other/private",
        branch: "main",
        filePath: "README.md",
        expiresIn: null,
        sharedWith: null,
        sharedWithName: null,
      }),
    ).rejects.toThrow("Repository access could not be verified");
  });

  it("rejects file and folder shares without a path", async () => {
    for (const type of ["file", "folder"] as const) {
      await expect(
        createShareAction({
          type,
          repo: "owner-user/notes",
          branch: "main",
          filePath: null,
          expiresIn: null,
          sharedWith: null,
          sharedWithName: null,
        }),
      ).rejects.toThrow("A file path is required");
    }
  });

  it("rejects malformed share payloads before persistence", async () => {
    const base = {
      type: "file" as const,
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      expiresIn: null,
      sharedWith: null,
      sharedWithName: null,
    };

    await expect(
      createShareAction({ ...base, expiresIn: "forever" }),
    ).rejects.toThrow("Invalid share expiry");
    await expect(
      createShareAction({
        ...base,
        type: "repo",
        filePath: "README.md",
      }),
    ).rejects.toThrow("Repository shares cannot include a file path");
    await expect(
      createShareAction({ ...base, sharedWith: "202" }),
    ).rejects.toThrow("must be provided together");
    await expect(
      createShareAction({
        ...base,
        type: "invalid" as "file",
      }),
    ).rejects.toThrow("Invalid share type");
  });

  it("verifies targeted recipients against GitHub", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/user/202")) {
          return new Response(
            JSON.stringify({ id: 202, login: "recipient-user" }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ full_name: "owner-user/notes", permissions: {} }),
          { status: 200 },
        );
      }),
    );

    await expect(
      createShareAction({
        type: "file",
        repo: "owner-user/notes",
        branch: "main",
        filePath: "README.md",
        expiresIn: "7d",
        sharedWith: "202",
        sharedWithName: "recipient-user",
      }),
    ).resolves.toHaveLength(12);
    await expect(
      createShareAction({
        type: "file",
        repo: "owner-user/notes",
        branch: "main",
        filePath: "README.md",
        expiresIn: "7d",
        sharedWith: "202",
        sharedWithName: "wrong-user",
      }),
    ).rejects.toThrow("Invalid share recipient");
  });

  it("rejects file snapshots that cannot be read or exceed the size limit", async () => {
    const base = {
      type: "file" as const,
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      expiresIn: "7d",
      sharedWith: null,
      sharedWithName: null,
    };
    const repositoryResponse = () =>
      new Response(
        JSON.stringify({ full_name: "owner-user/notes", permissions: {} }),
        { status: 200 },
      );

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(repositoryResponse())
        .mockResolvedValueOnce(new Response("not found", { status: 404 })),
    );
    await expect(createShareAction(base)).rejects.toThrow(
      "shared file could not be read",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(repositoryResponse())
        .mockResolvedValueOnce(new Response("x".repeat(1_000_001), { status: 200 })),
    );
    await expect(createShareAction(base)).rejects.toThrow(
      "exceeds the 1 MB snapshot limit",
    );
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

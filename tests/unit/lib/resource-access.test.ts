// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getShareMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getShareMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/shares", () => ({ getShare: getShareMock }));
vi.mock("@/lib/db", () => ({
  withDbRetry: (operation: () => Promise<unknown>) => operation(),
}));

import {
  authorizeResourceAccess,
  isShareResourceInScope,
  parseRepositorySlug,
  repositoryFromFileKey,
  verifyGitHubRepositoryAccess,
} from "@/lib/resource-access";

describe("resource access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      accessToken: "session-token",
      user: {
        id: "1",
        login: "owner",
        name: "Owner",
        image: null,
      },
    });
    getShareMock.mockResolvedValue(null);
  });

  it("accepts canonical repository slugs and rejects path-like input", () => {
    expect(parseRepositorySlug("owner/repo.name")).toEqual({
      owner: "owner",
      name: "repo.name",
    });
    expect(repositoryFromFileKey("owner/repo/main/README.md")).toBe(
      "owner/repo",
    );
    expect(() => parseRepositorySlug("owner/repo/contents")).toThrow(
      "Invalid repository",
    );
    expect(() => repositoryFromFileKey("owner-only")).toThrow(
      "Invalid comment resource",
    );
    expect(() => parseRepositorySlug(null as unknown as string)).toThrow(
      "Invalid repository",
    );
    expect(() => parseRepositorySlug(`${"o".repeat(40)}/repo`)).toThrow(
      "Invalid repository",
    );
  });

  it("rejects refs and paths that can change GitHub request semantics", async () => {
    await expect(
      authorizeResourceAccess({
        repo: "owner/repo",
        branch: "main?path=secret",
        path: "README.md",
      }),
    ).rejects.toThrow("Invalid branch");
    await expect(
      authorizeResourceAccess({
        repo: "owner/repo",
        branch: "main",
        path: "../secret.md",
      }),
    ).rejects.toThrow("Invalid path");
  });

  it("enforces file, folder, repository, and branch share boundaries", () => {
    const baseShare = {
      repo: "owner/repo",
      branch: "main",
      type: "folder" as const,
      file_path: "docs",
    };

    expect(
      isShareResourceInScope(baseShare, {
        repo: "owner/repo",
        branch: "main",
        path: "docs/guide.md",
      }),
    ).toBe(true);
    expect(
      isShareResourceInScope(baseShare, {
        repo: "owner/repo",
        branch: "main",
        path: "docs-private/guide.md",
      }),
    ).toBe(false);
    expect(
      isShareResourceInScope(baseShare, {
        repo: "owner/repo",
        branch: "dev",
        path: "docs/guide.md",
      }),
    ).toBe(false);
    expect(
      isShareResourceInScope(
        { ...baseShare, type: "file", file_path: "README.md" },
        { repo: "owner/repo", branch: "main", path: "README.md" },
      ),
    ).toBe(true);
    expect(
      isShareResourceInScope(
        { ...baseShare, type: "repo", file_path: null },
        { repo: "owner/repo", branch: "main", path: "anything.md" },
      ),
    ).toBe(true);
    expect(
      isShareResourceInScope(
        { ...baseShare, type: "repo", file_path: null },
        { repo: "owner/repo", branch: "main", path: null },
      ),
    ).toBe(true);
    expect(
      isShareResourceInScope(
        { ...baseShare, type: "folder", file_path: "" },
        { repo: "owner/repo", branch: "main", path: "README.md" },
      ),
    ).toBe(false);
  });

  it("proves repository access against GitHub and preserves moderator metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            full_name: "owner/repo",
            private: true,
            default_branch: "trunk",
            permissions: { maintain: true },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      verifyGitHubRepositoryAccess("secret-token", "owner/repo"),
    ).resolves.toEqual({
      canModerate: true,
      repositoryPrivate: true,
      defaultBranch: "trunk",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/repos/owner/repo"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      }),
    );
  });

  it("fails closed when GitHub denies access or returns a different repository", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
    );
    await expect(
      verifyGitHubRepositoryAccess("token", "owner/private"),
    ).rejects.toThrow("Repository access could not be verified");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ full_name: "other/repo" }), {
          status: 200,
        }),
      ),
    );
    await expect(
      verifyGitHubRepositoryAccess("token", "owner/repo"),
    ).rejects.toThrow("Repository access could not be verified");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(
      verifyGitHubRepositoryAccess("token", "owner/repo"),
    ).rejects.toThrow("network down");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );
    await expect(
      verifyGitHubRepositoryAccess("token", "owner/repo"),
    ).rejects.toThrow();
  });

  it("requires the intended user for targeted shares", async () => {
    getShareMock.mockResolvedValue({
      id: "share-1",
      repo: "owner/repo",
      branch: "main",
      type: "file",
      file_path: "README.md",
      shared_with: "2",
      owner_id: "1",
      accessToken: "share-token",
    });

    await expect(
      authorizeResourceAccess(
        { repo: "owner/repo", branch: "main", path: "README.md" },
        { shareId: "share-1" },
      ),
    ).rejects.toThrow("Not authorized");

    authMock.mockResolvedValue({
      accessToken: "recipient-token",
      user: { id: "2", login: "recipient", name: "Recipient", image: null },
    });
    await expect(
      authorizeResourceAccess(
        { repo: "owner/repo", branch: "main", path: "README.md" },
        { shareId: "share-1" },
      ),
    ).resolves.toMatchObject({
      accessToken: "share-token",
      actorId: "2",
      via: "share",
    });
  });
});

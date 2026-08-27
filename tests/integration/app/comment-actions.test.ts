// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../../helpers/postgres";
import {
  addComment,
  deleteCommentAction,
  fetchComments,
  resolveCommentAction,
  restoreCommentAction,
  unresolveCommentAction,
} from "@/app/repos/[owner]/[repo]/[...path]/comment-actions";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("comment actions", () => {
  useTestDatabase();

  const resource = {
    repo: "owner-user/notes",
    branch: "main",
    filePath: "README.md",
  };

  beforeEach(() => {
    authMock.mockResolvedValue({
      accessToken: "owner-token",
      user: {
        id: "1",
        login: "owner-user",
        name: "Owner User",
        image: null,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        const match = url.match(/\/repos\/([^/]+)\/([^/?]+)/);
        const fullName = match
          ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
          : "";
        const status = fullName.startsWith("blocked/") ? 404 : 200;
        return new Response(
          JSON.stringify({ full_name: fullName, permissions: {} }),
          { status, headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  it("creates, fetches, resolves, deletes, and restores comments", async () => {
    const created = await addComment({
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      quote: "Detail",
      quoteContext: "12",
      body: "Looks good",
      parentId: null,
    });

    expect(created.body).toBe("Looks good");
    expect(await fetchComments("owner-user/notes", "main", "README.md")).toHaveLength(
      1,
    );
    expect(await resolveCommentAction(created.id, resource)).toBe(true);
    expect(await unresolveCommentAction(created.id, resource)).toBe(true);
    expect(await deleteCommentAction(created.id, resource)).toBe(true);
    expect(await restoreCommentAction(created.id, resource)).toBe(true);
  });

  it("rejects unauthenticated access", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      addComment({
        repo: "owner-user/notes",
        branch: "main",
        filePath: "README.md",
        quote: null,
        quoteContext: null,
        body: "Looks good",
        parentId: null,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("unresolveCommentAction rejects non-author non-owner", async () => {
    const created = await addComment({
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      quote: null,
      quoteContext: null,
      body: "To be resolved",
      parentId: null,
    });
    await resolveCommentAction(created.id, resource);

    authMock.mockResolvedValue({
      accessToken: "other-token",
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    await expect(unresolveCommentAction(created.id, resource)).rejects.toThrow(
      "Not authorized",
    );
  });

  it("resolveCommentAction rejects non-author non-moderators", async () => {
    const created = await addComment({
      ...resource,
      quote: null,
      quoteContext: null,
      body: "Author-controlled resolution",
      parentId: null,
    });
    authMock.mockResolvedValue({
      accessToken: "other-token",
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    await expect(resolveCommentAction(created.id, resource)).rejects.toThrow(
      "Not authorized",
    );
  });

  it("restoreCommentAction rejects non-author non-owner", async () => {
    const created = await addComment({
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      quote: null,
      quoteContext: null,
      body: "To be deleted then restored",
      parentId: null,
    });
    await deleteCommentAction(created.id, resource);

    authMock.mockResolvedValue({
      accessToken: "other-token",
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    await expect(restoreCommentAction(created.id, resource)).rejects.toThrow(
      "Not authorized",
    );
  });

  it("deleteCommentAction rejects non-author non-owner", async () => {
    const created = await addComment({
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      quote: null,
      quoteContext: null,
      body: "Protected comment",
      parentId: null,
    });

    authMock.mockResolvedValue({
      accessToken: "other-token",
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    expect(await deleteCommentAction(created.id, resource)).toBe(false);
  });

  it("repo owner can delete another user's comment", async () => {
    const created = await addComment({
      repo: "repo-owner/notes",
      branch: "main",
      filePath: "README.md",
      quote: null,
      quoteContext: null,
      body: "Comment by user 1",
      parentId: null,
    });

    authMock.mockResolvedValue({
      accessToken: "repo-owner-token",
      user: { id: "2", login: "repo-owner", name: "Repo Owner", image: null },
    });

    expect(
      await deleteCommentAction(created.id, {
        ...resource,
        repo: "repo-owner/notes",
      }),
    ).toBe(true);
  });

  it("rejects unauthenticated comment reads without a share capability", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      fetchComments("owner-user/notes", "main", "README.md"),
    ).rejects.toThrow("Not authenticated");
  });

  it("requires identity for public-share comment reads and keeps file scope", async () => {
    const created = await addComment({
      ...resource,
      quote: null,
      quoteContext: null,
      body: "Shared feedback",
      parentId: null,
    });
    const { createShare } = await import("@/lib/shares");
    const shareId = await createShare({
      type: "file",
      ownerId: "1",
      repo: resource.repo,
      branch: resource.branch,
      filePath: resource.filePath,
      accessToken: "share-token",
      expiresIn: null,
      sharedWith: null,
      sharedWithName: null,
    });
    authMock.mockResolvedValue(null);

    await expect(
      fetchComments(resource.repo, resource.branch, resource.filePath, shareId),
    ).rejects.toThrow("Not authenticated");

    authMock.mockResolvedValue({
      accessToken: "viewer-token",
      user: { id: "2", login: "viewer", name: "Viewer", image: null },
    });
    await expect(
      fetchComments(resource.repo, resource.branch, resource.filePath, shareId),
    ).resolves.toMatchObject([{ id: created.id }]);
    await expect(
      fetchComments(resource.repo, resource.branch, "SECRET.md", shareId),
    ).rejects.toThrow("Not authorized");
  });

  it("rejects a forged resource when mutating a comment", async () => {
    const created = await addComment({
      ...resource,
      quote: null,
      quoteContext: null,
      body: "Scoped feedback",
      parentId: null,
    });

    await expect(
      resolveCommentAction(created.id, {
        ...resource,
        filePath: "OTHER.md",
      }),
    ).rejects.toThrow("Not authorized");
  });

  it("rejects replies to replies so accepted comments remain visible", async () => {
    const parent = await addComment({
      ...resource,
      quote: null,
      quoteContext: null,
      body: "Parent",
      parentId: null,
    });
    const reply = await addComment({
      ...resource,
      quote: null,
      quoteContext: null,
      body: "Reply",
      parentId: parent.id,
    });

    await expect(
      addComment({
        ...resource,
        quote: null,
        quoteContext: null,
        body: "Nested reply",
        parentId: reply.id,
      }),
    ).rejects.toThrow("Not authorized");
  });

  it("rejects repositories the caller cannot access", async () => {
    await expect(
      addComment({
        ...resource,
        repo: "blocked/private",
        quote: null,
        quoteContext: null,
        body: "Unauthorized feedback",
        parentId: null,
      }),
    ).rejects.toThrow("Repository access could not be verified");
  });
});

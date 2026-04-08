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

  beforeEach(() => {
    authMock.mockResolvedValue({
      user: {
        id: "1",
        login: "owner-user",
        name: "Owner User",
        image: null,
      },
    });
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
    expect(await resolveCommentAction(created.id)).toBe(true);
    expect(await unresolveCommentAction(created.id, "owner-user")).toBe(true);
    expect(await deleteCommentAction(created.id, "owner-user")).toBe(true);
    expect(await restoreCommentAction(created.id, "owner-user")).toBe(true);
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
    await resolveCommentAction(created.id);

    authMock.mockResolvedValue({
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    await expect(unresolveCommentAction(created.id)).rejects.toThrow(
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
    await deleteCommentAction(created.id, "owner-user");

    authMock.mockResolvedValue({
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    await expect(restoreCommentAction(created.id)).rejects.toThrow(
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
      user: { id: "2", login: "other-user", name: "Other User", image: null },
    });

    expect(await deleteCommentAction(created.id)).toBe(false);
  });

  it("repo owner can delete another user's comment", async () => {
    const created = await addComment({
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      quote: null,
      quoteContext: null,
      body: "Comment by user 1",
      parentId: null,
    });

    authMock.mockResolvedValue({
      user: { id: "2", login: "repo-owner", name: "Repo Owner", image: null },
    });

    expect(await deleteCommentAction(created.id, "repo-owner")).toBe(true);
  });

  it("fetchComments works without authentication", async () => {
    authMock.mockResolvedValue(null);

    const comments = await fetchComments(
      "owner-user/notes",
      "main",
      "README.md",
    );
    expect(Array.isArray(comments)).toBe(true);
  });
});

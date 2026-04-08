// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  buildFileKey,
  countOpenComments,
  countOpenCommentsForRepos,
  createComment,
  getRecentCommentsForRepos,
  getCommentById,
  getComments,
  getCommentsByPrefix,
  purgeComment,
  purgeDeletedComments,
  resolveComment,
  resolveComments,
  restoreComment,
  softDeleteComment,
  unresolveComment,
} from "@/lib/comments";
import { useTestDatabase } from "../../helpers/postgres";

describe("comments", () => {
  useTestDatabase();

  it("creates threaded comments and file keys", async () => {
    const fileKey = await buildFileKey("owner-user/notes", "main", "README.md");
    const parent = await createComment({
      fileKey,
      authorId: "1",
      authorName: "Owner User",
      authorAvatar: null,
      quote: "Detail",
      quoteContext: "12",
      body: "Parent comment",
      parentId: null,
    });

    const reply = await createComment({
      fileKey,
      authorId: "2",
      authorName: "Recipient User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Reply comment",
      parentId: parent.id,
    });

    const threads = await getComments(fileKey);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies?.[0].id).toBe(reply.id);
    expect(await getCommentById(parent.id)).toMatchObject({
      id: parent.id,
      body: "Parent comment",
    });
  });

  it("resolves, unreolves, filters, and aggregates comments", async () => {
    const fileKey = await buildFileKey("owner-user/notes", "main", "README.md");
    const a = await createComment({
      fileKey,
      authorId: "1",
      authorName: "Owner User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Open comment",
      parentId: null,
    });
    const b = await createComment({
      fileKey,
      authorId: "1",
      authorName: "Owner User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Another open comment",
      parentId: null,
    });
    await createComment({
      fileKey,
      authorId: "2",
      authorName: "Recipient User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Reply",
      parentId: a.id,
    });

    await expect(resolveComment(a.id, "1")).resolves.toBe(true);
    await expect(resolveComment(a.id, "1")).resolves.toBe(false);
    await expect(resolveComments([a.id, b.id], "1")).resolves.toEqual([b.id]);
    await expect(unresolveComment(a.id)).resolves.toBe(true);
    await expect(unresolveComment("missing")).resolves.toBe(false);

    const prefixResult = await getCommentsByPrefix("owner-user/notes/main/", {
      includeResolved: false,
      limit: 10,
    });
    expect(prefixResult.comments).toHaveLength(1);
    expect(prefixResult.comments[0].id).toBe(a.id);

    const resolvedResult = await getCommentsByPrefix("owner-user/notes/main/", {
      includeResolved: true,
      limit: 10,
    });
    expect(resolvedResult.comments).toHaveLength(2);
    expect(
      resolvedResult.comments.find((comment) => comment.id === a.id)?.replies,
    ).toHaveLength(1);

    expect(await countOpenComments("owner-user/notes/main/")).toMatchObject({
      [fileKey]: {
        count: 1,
      },
    });
    expect(
      await getCommentsByPrefix("owner-user/notes/other/", { limit: 10 }),
    ).toEqual({
      comments: [],
      nextCursor: null,
    });
    expect(await resolveComments([], "1")).toEqual([]);

    const paged = await getCommentsByPrefix("owner-user/notes/main/", {
      includeResolved: true,
      limit: 1,
      cursor: resolvedResult.comments[0].created_at,
    });
    expect(paged.comments.length).toBeLessThanOrEqual(1);
  });

  it("soft deletes, restores, and purges comments", async () => {
    const fileKey = await buildFileKey("owner-user/notes", "main", "README.md");
    const parent = await createComment({
      fileKey,
      authorId: "1",
      authorName: "Owner User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Parent",
      parentId: null,
    });
    const reply = await createComment({
      fileKey,
      authorId: "2",
      authorName: "Recipient User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Reply",
      parentId: parent.id,
    });

    await expect(softDeleteComment(parent.id, "2")).resolves.toBe(false);
    await expect(softDeleteComment(parent.id, "1")).resolves.toBe(true);
    expect(await getCommentById(parent.id)).toBeNull();

    await expect(restoreComment(parent.id)).resolves.toBe(true);
    expect(await getCommentById(parent.id)).not.toBeNull();
    expect(await getCommentById(reply.id)).not.toBeNull();
    await expect(restoreComment("missing")).resolves.toBe(false);

    await expect(purgeComment(parent.id, "2")).resolves.toBe(false);
    await expect(purgeComment(parent.id, "1")).resolves.toBe(true);
    expect(await getCommentById(parent.id)).toBeNull();

    const ownerOnly = await createComment({
      fileKey,
      authorId: "2",
      authorName: "Recipient User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Owner only",
      parentId: null,
    });
    await expect(purgeComment(ownerOnly.id, "1", true)).resolves.toBe(true);

    const stale = await createComment({
      fileKey,
      authorId: "1",
      authorName: "Owner User",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Stale",
      parentId: null,
    });
    await softDeleteComment(stale.id, "1");
    const db = getDb();
    await db`
      UPDATE comments
      SET deleted_at = NOW() - INTERVAL '31 days'
      WHERE id = ${stale.id}
    `;

    await expect(purgeDeletedComments()).resolves.toBe(1);
  });

  it("fetches recent comments and counts across repos", async () => {
    const fk1 = await buildFileKey("owner-user/notes", "main", "README.md");
    const fk2 = await buildFileKey("owner-user/other", "main", "docs.md");

    await createComment({
      fileKey: fk1,
      authorId: "1",
      authorName: "Owner",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Comment in notes",
      parentId: null,
    });
    await createComment({
      fileKey: fk2,
      authorId: "1",
      authorName: "Owner",
      authorAvatar: null,
      quote: null,
      quoteContext: null,
      body: "Comment in other",
      parentId: null,
    });

    // getRecentCommentsForRepos
    const recent = await getRecentCommentsForRepos(
      ["owner-user/notes", "owner-user/other"],
      10,
    );
    expect(recent).toHaveLength(2);
    expect(recent[0].body).toBe("Comment in other"); // newest first

    expect(await getRecentCommentsForRepos([], 10)).toEqual([]);
    expect(await getRecentCommentsForRepos(["no-match/repo"], 10)).toEqual([]);

    // countOpenCommentsForRepos
    const count = await countOpenCommentsForRepos([
      "owner-user/notes",
      "owner-user/other",
    ]);
    expect(count).toBe(2);

    expect(await countOpenCommentsForRepos([])).toBe(0);
  });
});

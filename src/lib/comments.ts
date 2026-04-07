"use server";

import { nanoid } from "nanoid";
import { getDb } from "./db";

export interface Comment {
  id: string;
  file_key: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  quote: string | null;
  quote_context: string | null;
  body: string;
  parent_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
}

/** Build a consistent file key from repo + branch + path */
function fileKey(repo: string, branch: string, filePath: string): string {
  return `${repo}/${branch}/${filePath}`;
}

export async function buildFileKey(
  repo: string,
  branch: string,
  filePath: string,
): Promise<string> {
  return fileKey(repo, branch, filePath);
}

export async function createComment(opts: {
  fileKey: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  quote: string | null;
  quoteContext: string | null;
  body: string;
  parentId: string | null;
}): Promise<Comment> {
  const db = getDb();
  const id = nanoid(12);

  const rows = await db`
    INSERT INTO comments (id, file_key, author_id, author_name, author_avatar, quote, quote_context, body, parent_id)
    VALUES (${id}, ${opts.fileKey}, ${opts.authorId}, ${opts.authorName}, ${opts.authorAvatar}, ${opts.quote}, ${opts.quoteContext}, ${opts.body}, ${opts.parentId})
    RETURNING *
  `;

  return rowToComment(rows[0]);
}

export async function getComments(fKey: string): Promise<Comment[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM comments
    WHERE file_key = ${fKey} AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  const all = rows.map(rowToComment);

  // Build threads: top-level comments with nested replies
  const topLevel = all.filter((c) => !c.parent_id);
  const byParent = new Map<string, Comment[]>();

  for (const c of all) {
    if (c.parent_id) {
      const siblings = byParent.get(c.parent_id) || [];
      siblings.push(c);
      byParent.set(c.parent_id, siblings);
    }
  }

  for (const c of topLevel) {
    c.replies = byParent.get(c.id) || [];
  }

  return topLevel;
}

export async function resolveComment(
  commentId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    UPDATE comments
    SET resolved_at = NOW(), resolved_by = ${userId}
    WHERE id = ${commentId} AND resolved_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function resolveComments(
  commentIds: string[],
  userId: string,
): Promise<string[]> {
  if (commentIds.length === 0) return [];
  const db = getDb();
  const rows = await db`
    UPDATE comments
    SET resolved_at = NOW(), resolved_by = ${userId}
    WHERE id = ANY(${commentIds}) AND resolved_at IS NULL
    RETURNING id
  `;
  return rows.map((r) => r.id as string);
}

export async function unresolveComment(commentId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    UPDATE comments
    SET resolved_at = NULL, resolved_by = NULL
    WHERE id = ${commentId} AND resolved_at IS NOT NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/** Soft-delete a comment and its replies (sets deleted_at) */
export async function softDeleteComment(
  commentId: string,
  userId: string,
  isOwner: boolean = false,
): Promise<boolean> {
  const db = getDb();
  // Author can soft-delete their own; repo owner can soft-delete any
  const rows = isOwner
    ? await db`
        UPDATE comments SET deleted_at = NOW()
        WHERE id = ${commentId} AND deleted_at IS NULL
        RETURNING id
      `
    : await db`
        UPDATE comments SET deleted_at = NOW()
        WHERE id = ${commentId} AND author_id = ${userId} AND deleted_at IS NULL
        RETURNING id
      `;
  if (rows.length > 0) {
    // Also soft-delete replies
    await db`
      UPDATE comments SET deleted_at = NOW()
      WHERE parent_id = ${commentId} AND deleted_at IS NULL
    `;
  }
  return rows.length > 0;
}

/** Restore a soft-deleted comment and its replies */
export async function restoreComment(commentId: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    UPDATE comments SET deleted_at = NULL WHERE id = ${commentId} AND deleted_at IS NOT NULL
  `;
  // Also restore replies
  await db`
    UPDATE comments SET deleted_at = NULL WHERE parent_id = ${commentId} AND deleted_at IS NOT NULL
  `;
  return result.count > 0;
}

/** Hard-delete a comment (for permanent purging) */
export async function purgeComment(
  commentId: string,
  userId: string,
  isOwner: boolean = false,
): Promise<boolean> {
  const db = getDb();
  // Author can purge their own; repo owner can purge any
  const rows = isOwner
    ? await db`
        DELETE FROM comments WHERE id = ${commentId} RETURNING id
      `
    : await db`
        DELETE FROM comments
        WHERE id = ${commentId} AND author_id = ${userId}
        RETURNING id
      `;
  return rows.length > 0;
}

/** Purge soft-deleted comments older than 30 days */
export async function purgeDeletedComments(): Promise<number> {
  const db = getDb();
  const result = await db`
    DELETE FROM comments
    WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'
  `;
  return result.count;
}

/** Fetch a single comment by ID */
export async function getCommentById(
  commentId: string,
): Promise<Comment | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM comments WHERE id = ${commentId} AND deleted_at IS NULL
  `;
  return rows.length > 0 ? rowToComment(rows[0]) : null;
}

/** Fetch threaded comments across multiple files by prefix, with pagination */
export async function getCommentsByPrefix(
  prefix: string,
  opts: {
    includeResolved?: boolean;
    limit?: number;
    cursor?: string;
  } = {},
): Promise<{ comments: Comment[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = opts.limit ?? 50;

  // Fetch top-level comments
  const topRows = opts.cursor
    ? opts.includeResolved
      ? await db`
          SELECT * FROM comments
          WHERE file_key LIKE ${prefix + "%"}
            AND parent_id IS NULL
            AND deleted_at IS NULL
            AND created_at < ${opts.cursor}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await db`
          SELECT * FROM comments
          WHERE file_key LIKE ${prefix + "%"}
            AND parent_id IS NULL
            AND resolved_at IS NULL
            AND deleted_at IS NULL
            AND created_at < ${opts.cursor}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
    : opts.includeResolved
      ? await db`
          SELECT * FROM comments
          WHERE file_key LIKE ${prefix + "%"}
            AND parent_id IS NULL
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await db`
          SELECT * FROM comments
          WHERE file_key LIKE ${prefix + "%"}
            AND parent_id IS NULL
            AND resolved_at IS NULL
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

  const topLevel = topRows.map(rowToComment);
  if (topLevel.length === 0) {
    return { comments: [], nextCursor: null };
  }

  // Batch-fetch replies for all top-level comments
  const ids = topLevel.map((c) => c.id);
  const replyRows = await db`
    SELECT * FROM comments
    WHERE parent_id = ANY(${ids}) AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  const byParent = new Map<string, Comment[]>();
  for (const row of replyRows) {
    const reply = rowToComment(row);
    const siblings = byParent.get(reply.parent_id!) || [];
    siblings.push(reply);
    byParent.set(reply.parent_id!, siblings);
  }

  for (const c of topLevel) {
    c.replies = byParent.get(c.id) || [];
  }

  const nextCursor =
    topLevel.length === limit
      ? topLevel[topLevel.length - 1].created_at
      : null;

  return { comments: topLevel, nextCursor };
}

/** Count open (unresolved) comments per file key prefix, with latest activity */
export async function countOpenComments(
  fileKeyPrefix: string,
): Promise<Record<string, { count: number; latest: string | null }>> {
  const db = getDb();
  const rows = await db`
    SELECT file_key, COUNT(*)::int as count, MAX(created_at) as latest
    FROM comments
    WHERE file_key LIKE ${fileKeyPrefix + '%'}
      AND resolved_at IS NULL
      AND parent_id IS NULL
      AND deleted_at IS NULL
    GROUP BY file_key
  `;
  const counts: Record<string, { count: number; latest: string | null }> = {};
  for (const row of rows) {
    counts[row.file_key as string] = {
      count: row.count as number,
      latest: row.latest as string | null,
    };
  }
  return counts;
}

function rowToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    file_key: row.file_key as string,
    author_id: row.author_id as string,
    author_name: row.author_name as string,
    author_avatar: row.author_avatar as string | null,
    quote: row.quote as string | null,
    quote_context: row.quote_context as string | null,
    body: row.body as string,
    parent_id: row.parent_id as string | null,
    resolved_at: row.resolved_at as string | null,
    resolved_by: row.resolved_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

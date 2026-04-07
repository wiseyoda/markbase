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
    WHERE file_key = ${fKey}
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

export async function deleteComment(
  commentId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();
  // Only author can delete
  const rows = await db`
    DELETE FROM comments
    WHERE id = ${commentId} AND author_id = ${userId}
    RETURNING id
  `;
  // Also delete replies
  if (rows.length > 0) {
    await db`DELETE FROM comments WHERE parent_id = ${commentId}`;
  }
  return rows.length > 0;
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

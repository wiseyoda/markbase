"use server";

import { nanoid } from "nanoid";
import { getDb } from "./db";
import { encrypt, decrypt } from "./crypto";

export interface Share {
  id: string;
  type: "file" | "repo" | "folder";
  owner_id: string;
  repo: string;
  branch: string;
  file_path: string | null;
  created_at: string;
  expires_at: string | null;
  deleted_at: string | null;
}

export interface ShareWithToken extends Share {
  accessToken: string;
}

export async function createShare(opts: {
  type: "file" | "repo" | "folder";
  ownerId: string;
  repo: string;
  branch: string;
  filePath: string | null;
  accessToken: string;
  expiresIn: string | null; // '1h', '1d', '7d', '30d', or null for never
}): Promise<string> {
  const sql = getDb();
  const id = nanoid(12);
  const encryptedToken = encrypt(opts.accessToken);

  let expiresAt: string | null = null;
  if (opts.expiresIn) {
    const ms: Record<string, number> = {
      "1h": 3600000,
      "1d": 86400000,
      "7d": 604800000,
      "30d": 2592000000,
    };
    const duration = ms[opts.expiresIn];
    if (duration) {
      expiresAt = new Date(Date.now() + duration).toISOString();
    }
  }

  await sql`
    INSERT INTO shares (id, type, owner_id, repo, branch, file_path, access_token, expires_at)
    VALUES (${id}, ${opts.type}, ${opts.ownerId}, ${opts.repo}, ${opts.branch}, ${opts.filePath}, ${encryptedToken}, ${expiresAt})
  `;

  return id;
}

export async function getShare(id: string): Promise<ShareWithToken | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM shares
    WHERE id = ${id}
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  `;

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id as string,
    type: row.type as "file" | "repo",
    owner_id: row.owner_id as string,
    repo: row.repo as string,
    branch: row.branch as string,
    file_path: row.file_path as string | null,
    created_at: row.created_at as string,
    expires_at: row.expires_at as string | null,
    deleted_at: row.deleted_at as string | null,
    accessToken: decrypt(row.access_token as string),
  };
}

export async function listSharesForRepo(
  ownerId: string,
  repo: string,
): Promise<Share[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, type, owner_id, repo, branch, file_path, created_at, expires_at, deleted_at
    FROM shares
    WHERE owner_id = ${ownerId}
      AND repo = ${repo}
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as string,
    type: row.type as "file" | "repo" | "folder",
    owner_id: row.owner_id as string,
    repo: row.repo as string,
    branch: row.branch as string,
    file_path: row.file_path as string | null,
    created_at: row.created_at as string,
    expires_at: row.expires_at as string | null,
    deleted_at: row.deleted_at as string | null,
  }));
}

export async function listShares(ownerId: string): Promise<Share[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, type, owner_id, repo, branch, file_path, created_at, expires_at, deleted_at
    FROM shares
    WHERE owner_id = ${ownerId}
      AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;

  return rows.map((row) => ({
    id: row.id as string,
    type: row.type as "file" | "repo",
    owner_id: row.owner_id as string,
    repo: row.repo as string,
    branch: row.branch as string,
    file_path: row.file_path as string | null,
    created_at: row.created_at as string,
    expires_at: row.expires_at as string | null,
    deleted_at: row.deleted_at as string | null,
  }));
}

export async function deleteShare(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE shares
    SET deleted_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

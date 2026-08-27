import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { decrypt, encrypt } from "@/lib/crypto";
import { getDb, withDbRetry } from "@/lib/db";

export interface McpGrant {
  id: string;
  userId: string;
  login: string;
  name: string;
  avatarUrl: string;
  githubToken: string;
  tokenVersion: number;
}

interface McpGrantRow {
  id: string;
  user_id: string;
  login: string;
  name: string;
  avatar_url: string;
  github_token: string;
  token_version: number;
}

function rowToGrant(row: McpGrantRow): McpGrant {
  return {
    id: row.id,
    userId: row.user_id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
    githubToken: decrypt(row.github_token),
    tokenVersion: row.token_version,
  };
}

export async function consumeMcpAuthorizationCode(code: string): Promise<boolean> {
  const digest = createHash("sha256").update(code).digest("hex");
  const rows = await withDbRetry(() => getDb()`
    INSERT INTO mcp_auth_codes (code_digest, consumed_at)
    VALUES (${digest}, NOW())
    ON CONFLICT (code_digest) DO NOTHING
    RETURNING code_digest
  `);
  return rows.length === 1;
}

export async function createMcpGrant(input: {
  userId: string;
  login: string;
  name: string;
  avatarUrl: string;
  githubToken: string;
}): Promise<McpGrant> {
  const id = nanoid(24);
  const rows = await withDbRetry(() => getDb()<McpGrantRow[]>`
    INSERT INTO mcp_grants (
      id, user_id, login, name, avatar_url, github_token, token_version,
      expires_at
    )
    VALUES (
      ${id}, ${input.userId}, ${input.login}, ${input.name},
      ${input.avatarUrl}, ${encrypt(input.githubToken)}, 1,
      NOW() + INTERVAL '90 days'
    )
    RETURNING id, user_id, login, name, avatar_url, github_token, token_version
  `);
  return rowToGrant(rows[0]);
}

export async function getMcpGrant(
  id: string,
  tokenVersion: number,
): Promise<McpGrant | null> {
  const rows = await withDbRetry(() => getDb()<McpGrantRow[]>`
    SELECT id, user_id, login, name, avatar_url, github_token, token_version
    FROM mcp_grants
    WHERE id = ${id}
      AND token_version = ${tokenVersion}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `);
  return rows[0] ? rowToGrant(rows[0]) : null;
}

export async function rotateMcpGrant(
  id: string,
  tokenVersion: number,
): Promise<McpGrant | null> {
  const rows = await withDbRetry(() => getDb()<McpGrantRow[]>`
    UPDATE mcp_grants
    SET token_version = token_version + 1,
        updated_at = NOW()
    WHERE id = ${id}
      AND token_version = ${tokenVersion}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    RETURNING id, user_id, login, name, avatar_url, github_token, token_version
  `);
  return rows[0] ? rowToGrant(rows[0]) : null;
}

export async function revokeMcpGrant(id: string): Promise<boolean> {
  const rows = await withDbRetry(() => getDb()`
    UPDATE mcp_grants
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND revoked_at IS NULL
    RETURNING id
  `);
  return rows.length === 1;
}

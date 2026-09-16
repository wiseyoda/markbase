import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { decrypt, encrypt } from "@/lib/crypto";
import { getDb, withDbRetry } from "@/lib/db";
import { githubWebUrl } from "@/lib/github-config";

const GITHUB_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const GITHUB_REFRESH_LEASE_MS = 30 * 1000;
const GITHUB_REFRESH_TIMEOUT_MS = 10 * 1000;

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
  github_token_expires_at: Date | null;
  github_refresh_token: string | null;
  github_refresh_token_expires_at: Date | null;
  github_refresh_claim_id: string | null;
  github_refresh_claimed_at: Date | null;
  token_version: number;
}

interface GitHubCredentialInput {
  githubToken: string;
  githubTokenExpiresAt?: number;
  githubRefreshToken?: string;
  githubRefreshTokenExpiresAt?: number;
}

interface GitHubRefreshResponse {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  error?: unknown;
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

function dateFromEpoch(value: number | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

function expiresAt(seconds: unknown, now: number): Date | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return new Date(now + seconds * 1000);
}

function needsRefresh(row: McpGrantRow, now = Date.now()): boolean {
  return (
    row.github_token_expires_at !== null &&
    row.github_token_expires_at.getTime() <= now + GITHUB_REFRESH_WINDOW_MS
  );
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
} & GitHubCredentialInput): Promise<McpGrant> {
  const id = nanoid(24);
  const encryptedAccessToken = encrypt(input.githubToken);
  const encryptedRefreshToken = input.githubRefreshToken
    ? encrypt(input.githubRefreshToken)
    : null;
  const accessExpiresAt = dateFromEpoch(input.githubTokenExpiresAt);
  const refreshExpiresAt = dateFromEpoch(input.githubRefreshTokenExpiresAt);

  return withDbRetry(() =>
    getDb().begin(async (db) => {
      await db`
        SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))
      `;
      await db`
        UPDATE mcp_grants
        SET github_token = ${encryptedAccessToken},
            github_token_expires_at = ${accessExpiresAt},
            github_refresh_token = ${encryptedRefreshToken},
            github_refresh_token_expires_at = ${refreshExpiresAt},
            updated_at = NOW()
        WHERE user_id = ${input.userId}
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `;
      const rows = await db<McpGrantRow[]>`
        INSERT INTO mcp_grants (
          id, user_id, login, name, avatar_url, github_token,
          github_token_expires_at, github_refresh_token,
          github_refresh_token_expires_at, token_version, expires_at
        )
        VALUES (
          ${id}, ${input.userId}, ${input.login}, ${input.name},
          ${input.avatarUrl}, ${encryptedAccessToken}, ${accessExpiresAt},
          ${encryptedRefreshToken}, ${refreshExpiresAt}, 1,
          NOW() + INTERVAL '90 days'
        )
        RETURNING id, user_id, login, name, avatar_url, github_token,
                  github_token_expires_at, github_refresh_token,
                  github_refresh_token_expires_at, token_version
      `;
      return rowToGrant(rows[0]);
    }),
  );
}

async function claimGitHubCredentialRefresh(
  id: string,
  tokenVersion: number,
  userId: string,
): Promise<McpGrantRow | null> {
  const claimId = nanoid(24);
  return withDbRetry(() =>
    getDb().begin(async (db) => {
      // Claim one canonical row atomically. Concurrent refreshers contend on
      // the same row, and PostgreSQL rechecks the expiry/lease predicate after
      // the winner commits, so a freshly rotated credential cannot be claimed again.
      const claimed = await db<{ user_id: string }[]>`
        UPDATE mcp_grants
        SET github_refresh_claim_id = ${claimId},
            github_refresh_claimed_at = NOW(),
            updated_at = NOW()
        WHERE id = (
          SELECT id FROM mcp_grants
          WHERE user_id = ${userId}
            AND revoked_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at, id
          LIMIT 1
        )
          AND github_token_expires_at IS NOT NULL
          AND github_token_expires_at <= NOW() + (${GITHUB_REFRESH_WINDOW_MS} * INTERVAL '1 millisecond')
          AND (
            github_refresh_claim_id IS NULL
            OR github_refresh_claimed_at <= NOW() - (${GITHUB_REFRESH_LEASE_MS} * INTERVAL '1 millisecond')
          )
        RETURNING user_id
      `;
      if (claimed.length === 0) return null;

      await db`
        UPDATE mcp_grants
        SET github_refresh_claim_id = ${claimId},
            github_refresh_claimed_at = NOW(),
            updated_at = NOW()
        WHERE user_id = ${userId}
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `;
      const rows = await db<McpGrantRow[]>`
        SELECT id, user_id, login, name, avatar_url, github_token,
               github_token_expires_at, github_refresh_token,
               github_refresh_token_expires_at, github_refresh_claim_id,
               github_refresh_claimed_at, token_version
        FROM mcp_grants
        WHERE id = ${id}
          AND token_version = ${tokenVersion}
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `;
      return rows[0] || null;
    }),
  );
}

async function clearGitHubCredentialRefreshClaim(
  userId: string,
  claimId: string,
): Promise<void> {
  await withDbRetry(async () => {
    await getDb()`
      UPDATE mcp_grants
      SET github_refresh_claim_id = NULL,
          github_refresh_claimed_at = NULL,
          updated_at = NOW()
      WHERE user_id = ${userId}
        AND github_refresh_claim_id = ${claimId}
    `;
  });
}

async function refreshMcpGrantCredential(
  id: string,
  tokenVersion: number,
  userId: string,
): Promise<McpGrant | null> {
  const current = await claimGitHubCredentialRefresh(id, tokenVersion, userId);
  if (!current) {
    const rows = await withDbRetry(() => getDb()<McpGrantRow[]>`
      SELECT id, user_id, login, name, avatar_url, github_token,
             github_token_expires_at, github_refresh_token,
             github_refresh_token_expires_at, github_refresh_claim_id,
             github_refresh_claimed_at, token_version
      FROM mcp_grants
      WHERE id = ${id}
        AND token_version = ${tokenVersion}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `);
    const latest = rows[0];
    if (!latest) return null;
    if (!needsRefresh(latest) || latest.github_token_expires_at!.getTime() > Date.now()) {
      return rowToGrant(latest);
    }
    throw new Error("GitHub credential refresh is already in progress");
  }

  const claimId = current.github_refresh_claim_id!;
  try {

      const now = Date.now();
      if (
        !current.github_refresh_token ||
        (current.github_refresh_token_expires_at !== null &&
          current.github_refresh_token_expires_at.getTime() <= now)
      ) {
        throw new Error("GitHub credential expired and cannot be refreshed");
      }

      const clientId = process.env.GITHUB_ID;
      const clientSecret = process.env.GITHUB_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("GitHub OAuth credentials are not configured");
      }

      const currentRefreshToken = decrypt(current.github_refresh_token);
      const response = await fetch(githubWebUrl("/login/oauth/access_token"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: currentRefreshToken,
        }),
        signal: AbortSignal.timeout(GITHUB_REFRESH_TIMEOUT_MS),
      });
      const tokenData = (await response.json()) as GitHubRefreshResponse;
      if (
        !response.ok ||
        tokenData.error ||
        typeof tokenData.access_token !== "string"
      ) {
        throw new Error("Failed to refresh GitHub credential");
      }

      const refreshedAt = Date.now();
      const nextRefreshToken =
        typeof tokenData.refresh_token === "string"
          ? tokenData.refresh_token
          : currentRefreshToken;
      const nextRefreshExpiresAt =
        typeof tokenData.refresh_token === "string"
          ? expiresAt(tokenData.refresh_token_expires_in, refreshedAt)
          : current.github_refresh_token_expires_at;
      const encryptedAccessToken = encrypt(tokenData.access_token);
      const encryptedRefreshToken = encrypt(nextRefreshToken);
      const accessExpiresAt = expiresAt(tokenData.expires_in, refreshedAt);

    // GitHub refresh tokens rotate once. Cache the successful response above;
    // withDbRetry may replay only this persistence step, never the exchange.
    return await withDbRetry(() =>
      getDb().begin(async (db) => {
        await db`
          UPDATE mcp_grants
          SET github_token = ${encryptedAccessToken},
              github_token_expires_at = ${accessExpiresAt},
              github_refresh_token = ${encryptedRefreshToken},
              github_refresh_token_expires_at = ${nextRefreshExpiresAt},
              github_refresh_claim_id = NULL,
              github_refresh_claimed_at = NULL,
              updated_at = NOW()
          WHERE user_id = ${current.user_id}
            AND github_refresh_claim_id = ${claimId}
            AND revoked_at IS NULL
            AND expires_at > NOW()
        `;
        const refreshed = await db<McpGrantRow[]>`
          SELECT id, user_id, login, name, avatar_url, github_token,
                 github_token_expires_at, github_refresh_token,
                 github_refresh_token_expires_at, github_refresh_claim_id,
                 github_refresh_claimed_at, token_version
          FROM mcp_grants
          WHERE id = ${id} AND token_version = ${tokenVersion}
          LIMIT 1
        `;
        return refreshed[0] ? rowToGrant(refreshed[0]) : null;
      }),
    );
  } catch (error) {
    await clearGitHubCredentialRefreshClaim(current.user_id, claimId).catch(() => {});
    throw error;
  }
}

export async function getMcpGrant(
  id: string,
  tokenVersion: number,
): Promise<McpGrant | null> {
  const rows = await withDbRetry(() => getDb()<McpGrantRow[]>`
    SELECT id, user_id, login, name, avatar_url, github_token,
           github_token_expires_at, github_refresh_token,
           github_refresh_token_expires_at, github_refresh_claim_id,
           github_refresh_claimed_at, token_version
    FROM mcp_grants
    WHERE id = ${id}
      AND token_version = ${tokenVersion}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `);
  const grant = rows[0];
  if (!grant) return null;
  if (!needsRefresh(grant)) return rowToGrant(grant);
  return refreshMcpGrantCredential(id, tokenVersion, grant.user_id);
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
    RETURNING id, user_id, login, name, avatar_url, github_token,
              github_token_expires_at, github_refresh_token,
              github_refresh_token_expires_at, github_refresh_claim_id,
              github_refresh_claimed_at, token_version
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

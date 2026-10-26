// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { getDb, getDbSchemaStatus, initDb, resetDb } from "@/lib/db";
import { startTestDatabase, stopTestDatabase } from "../../helpers/postgres";
import { createMcpGrant } from "@/lib/mcp/grants";
import { getUserGitHubToken, upsertUser } from "@/lib/users";

describe("db", () => {
  afterEach(async () => {
    await resetDb();
    delete process.env.POSTGRES_URL;
    delete process.env.PRISMA_DATABASE_URL;
    delete process.env.POSTGRES_SSL;
  });

  it("throws when no database URL exists", () => {
    expect(() => getDb()).toThrow("No database URL found in env");
  });

  it("memoizes and resets the database client", async () => {
    await startTestDatabase();

    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);

    await initDb();
    await expect(getDbSchemaStatus()).resolves.toEqual({
      ready: true,
      missingTables: [],
      missingColumns: [],
    });
    await resetDb();

    const third = getDb();
    expect(third).not.toBe(first);

    await stopTestDatabase();
  });

  it("idempotently migrates and reports GitHub credential columns", async () => {
    await startTestDatabase();
    const db = getDb();
    await db`
      ALTER TABLE mcp_grants
      DROP COLUMN github_token_expires_at,
      DROP COLUMN github_refresh_token,
      DROP COLUMN github_refresh_token_expires_at,
      DROP COLUMN github_refresh_claim_id,
      DROP COLUMN github_refresh_claimed_at,
      DROP COLUMN token_rotated_at
    `;
    await db`
      ALTER TABLE users
      DROP COLUMN github_token,
      DROP COLUMN github_token_updated_at
    `;

    const before = await getDbSchemaStatus();
    expect(before.ready).toBe(false);
    expect(before.missingColumns).toEqual(
      expect.arrayContaining([
        "mcp_grants.github_token_expires_at",
        "mcp_grants.github_refresh_token",
        "mcp_grants.github_refresh_token_expires_at",
        "mcp_grants.github_refresh_claim_id",
        "mcp_grants.github_refresh_claimed_at",
        "mcp_grants.token_rotated_at",
        "users.github_token",
        "users.github_token_updated_at",
      ]),
    );

    await initDb();
    await initDb();
    await expect(getDbSchemaStatus()).resolves.toEqual({
      ready: true,
      missingTables: [],
      missingColumns: [],
    });
    await stopTestDatabase();
  });

  it("backfills the current GitHub token from active MCP grants without overwriting", async () => {
    await startTestDatabase();
    await upsertUser({ id: "7", login: "mcp-only", name: null, avatarUrl: null });
    await createMcpGrant({
      userId: "7",
      login: "mcp-only",
      name: "MCP Only",
      avatarUrl: "",
      githubToken: "older-grant-token",
    });
    await createMcpGrant({
      userId: "7",
      login: "mcp-only",
      name: "MCP Only",
      avatarUrl: "",
      githubToken: "newest-grant-token",
    });
    await upsertUser({
      id: "8",
      login: "web-user",
      name: null,
      avatarUrl: null,
      githubToken: "web-token",
    });
    await createMcpGrant({
      userId: "8",
      login: "web-user",
      name: "Web User",
      avatarUrl: "",
      githubToken: "grant-token",
    });

    await initDb();

    await expect(getUserGitHubToken("7")).resolves.toBe("newest-grant-token");
    await expect(getUserGitHubToken("8")).resolves.toBe("web-token");
    await stopTestDatabase();
  });
});

// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { getDb, getDbSchemaStatus, initDb, resetDb } from "@/lib/db";
import { startTestDatabase, stopTestDatabase } from "../../helpers/postgres";

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
      DROP COLUMN github_refresh_claimed_at
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
});

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
});

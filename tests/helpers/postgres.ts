import { afterAll, beforeAll, beforeEach } from "vitest";
import { GenericContainer, Wait } from "testcontainers";
import { getDb, initDb, resetDb } from "@/lib/db";

let container: Awaited<ReturnType<GenericContainer["start"]>> | null = null;
const DB_READY_ATTEMPTS = 20;
const DB_READY_DELAY_MS = 250;

export async function startTestDatabase() {
  if (!container) {
    container = await new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_DB: "markbase",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections"),
      )
      .start();
  }

  process.env.POSTGRES_URL =
    `postgres://postgres:postgres@127.0.0.1:${container.getMappedPort(5432)}/markbase`;
  process.env.PRISMA_DATABASE_URL = process.env.POSTGRES_URL;
  process.env.POSTGRES_SSL = "false";
  process.env.SHARE_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  Object.assign(process.env, { NODE_ENV: "test" });

  for (let attempt = 0; attempt < DB_READY_ATTEMPTS; attempt++) {
    try {
      await resetDb();
      await initDb();
      return;
    } catch (error) {
      if (attempt === DB_READY_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, DB_READY_DELAY_MS));
    }
  }
}

export async function clearTestDatabase() {
  await startTestDatabase();
  const db = getDb();
  await db`
    TRUNCATE TABLE comments, shares, synced_repos, users, mcp_auth_codes, mcp_grants,
      mcp_device_codes
    RESTART IDENTITY CASCADE
  `;
}

export async function stopTestDatabase() {
  await resetDb();
  if (!container) return;
  await container.stop();
  container = null;
}

export function useTestDatabase() {
  beforeAll(async () => {
    await startTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });
}

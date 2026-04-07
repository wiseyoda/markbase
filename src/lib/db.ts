import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (sql) return sql;

  const url = process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL found in env");

  sql = postgres(url, { ssl: "require" });
  return sql;
}

export async function initDb() {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('file', 'repo')),
      owner_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      file_path TEXT,
      access_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
  `;
}

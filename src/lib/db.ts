import { neon } from "@neondatabase/serverless";

export function getDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return sql;
}

export async function initDb() {
  const sql = getDb();
  await sql`
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

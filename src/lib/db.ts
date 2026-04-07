import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (sql) return sql;

  const url = process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL found in env");

  sql = postgres(url, {
    ssl: "require",
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
  });
  return sql;
}

export async function initDb() {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('file', 'repo', 'folder')),
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
  // Migrate existing constraint to support folder type
  await db`
    ALTER TABLE shares DROP CONSTRAINT IF EXISTS shares_type_check
  `.catch(() => {});
  await db`
    ALTER TABLE shares ADD CONSTRAINT shares_type_check
    CHECK (type IN ('file', 'repo', 'folder'))
  `.catch(() => {});
  await db`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      file_key TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      quote TEXT,
      quote_context TEXT,
      body TEXT NOT NULL,
      parent_id TEXT REFERENCES comments(id),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_comments_file_key ON comments(file_key)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)
  `;
  // Migrate FK to CASCADE delete
  await db`
    ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_parent_id_fkey
  `.catch(() => {});
  await db`
    ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
  `.catch(() => {});
  await db`
    CREATE TABLE IF NOT EXISTS synced_repos (
      user_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, repo)
    )
  `;
}

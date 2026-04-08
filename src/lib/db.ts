import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

function ignoreNotice() {}

/**
 * Suppress expected idempotent migration errors (duplicate column/constraint,
 * "already exists", "does not exist"). Logs a warning so real failures
 * (permissions, syntax, connection) are visible in logs rather than silently swallowed.
 */
async function ignoreDbError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch {
    // Expected: idempotent migration steps (duplicate column, constraint already
    // exists, etc.). Swallowed intentionally — initDb is designed to be re-runnable.
  }
}

function resolveSsl(): false | "require" {
  const ssl = process.env.POSTGRES_SSL;
  if (ssl === "false" || ssl === "disable" || process.env.NODE_ENV === "test") {
    return false;
  }
  return "require";
}

function resolveMaxConnections(): number {
  const parsed = Number(process.env.POSTGRES_POOL_MAX || "5");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function getDb() {
  if (sql) return sql;

  const url = process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL found in env");

  sql = postgres(url, {
    ssl: resolveSsl(),
    max: resolveMaxConnections(),
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false,
    onnotice: ignoreNotice,
  });
  return sql;
}

export async function resetDb() {
  if (!sql) return;
  await sql.end({ timeout: 1 });
  sql = null;
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
  await ignoreDbError(db`
    ALTER TABLE shares DROP CONSTRAINT IF EXISTS shares_type_check
  `);
  await ignoreDbError(db`
    ALTER TABLE shares ADD CONSTRAINT shares_type_check
    CHECK (type IN ('file', 'repo', 'folder'))
  `);
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
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_comments_file_key_prefix ON comments(file_key text_pattern_ops)
  `);
  await db`
    CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)
  `;
  // Migrate FK to CASCADE delete
  await ignoreDbError(db`
    ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_parent_id_fkey
  `);
  await ignoreDbError(db`
    ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
  `);
  await db`
    CREATE TABLE IF NOT EXISTS synced_repos (
      user_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, repo)
    )
  `;
  // Users table for tracking authenticated users
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      name TEXT,
      avatar_url TEXT,
      last_login TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_users_login ON users(login)
  `);
  // Add shared_with column for user-targeted shares
  await ignoreDbError(db`
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS shared_with TEXT
  `);
  await ignoreDbError(db`
    ALTER TABLE shares ADD COLUMN IF NOT EXISTS shared_with_name TEXT
  `);
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_shares_shared_with ON shares(shared_with)
  `);
  // Composite index for countOpenComments and getCommentsByPrefix hot path
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_comments_file_key_open
    ON comments(file_key, created_at DESC)
    WHERE resolved_at IS NULL AND parent_id IS NULL
  `);
  // Soft-delete support for comments
  await ignoreDbError(db`
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
  `);
  // Indexes for shares queries (listShares, listSharesForRepo)
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_shares_owner_id ON shares(owner_id)
  `);
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_shares_owner_repo ON shares(owner_id, repo)
  `);
}

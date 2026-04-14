import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

function ignoreNotice() {}

/** Postgres error codes safe to ignore in idempotent migrations */
const IDEMPOTENT_PG_CODES = new Set([
  "42701", // duplicate_column
  "42710", // duplicate_object (constraint/index already exists)
  "42P07", // duplicate_table
  "42704", // undefined_object (DROP IF NOT EXISTS target missing)
  "42P01", // undefined_table
]);

/**
 * Suppress expected idempotent migration errors (duplicate column/constraint,
 * "already exists", "does not exist"). Real failures (permissions, syntax,
 * connection) are rethrown so initDb fails fast.
 */
async function ignoreDbError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code && IDEMPOTENT_PG_CODES.has(code)) return;
    throw error;
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
  const envMax = process.env.POSTGRES_POOL_MAX;
  if (envMax) {
    const parsed = Number(envMax);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }
  // Serverless (Vercel) should use 1 connection per instance;
  // local dev can afford a small pool
  return process.env.VERCEL ? 1 : 3;
}

/** Connection errors that warrant resetting the pool */
const TRANSIENT_ERRORS = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
]);

function validateUrl(url: string): void {
  if (url.startsWith("prisma://")) {
    throw new Error(
      "PRISMA_DATABASE_URL uses prisma:// scheme which is incompatible with " +
      "postgres.js. Use a postgresql:// connection string (e.g. from Prisma " +
      "Accelerate's 'Direct connection' URL, or set POSTGRES_URL instead).",
    );
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) {
      throw new Error(`Database URL has no hostname: ${parsed.protocol}//???`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("PRISMA_DATABASE_URL"))
      throw e;
    throw new Error(`Invalid database URL: ${(e as Error).message}`);
  }
}

export function getDb() {
  if (sql) return sql;

  const url = process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL found in env");
  validateUrl(url);

  sql = postgres(url, {
    ssl: resolveSsl(),
    max: resolveMaxConnections(),
    idle_timeout: process.env.VERCEL ? 2 : 20,
    max_lifetime: process.env.VERCEL ? 60 : 60 * 5,
    connect_timeout: 15,
    prepare: false,
    onnotice: ignoreNotice,
    connection: { application_name: "markbase" },
  });
  return sql;
}

/**
 * Check if an error is a transient connection failure. When true,
 * the caller should reset the pool and may retry.
 */
export function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return !!code && TRANSIENT_ERRORS.has(code);
}

/**
 * Force-close the connection pool. Called on fatal connection errors
 * so the next request creates a fresh client instead of reusing a
 * broken singleton.
 */
export async function resetDb() {
  if (!sql) return;
  await sql.end({ timeout: 1 }).catch(() => {});
  sql = null;
}

/**
 * Run a database operation with automatic retry on transient connection errors.
 * On the first CONNECT_TIMEOUT / CONNECTION_CLOSED, resets the pool and retries once.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isTransientDbError(error)) {
      console.warn(
        `[db] Transient error (${(error as { code?: string }).code}), resetting pool and retrying`,
      );
      await resetDb();
      return fn();
    }
    throw error;
  }
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
  // Track visited shared links so users can find them again
  await db`
    CREATE TABLE IF NOT EXISTS share_visits (
      user_id TEXT NOT NULL,
      share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, share_id)
    )
  `;
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_share_visits_user ON share_visits(user_id, visited_at DESC)
  `);
  // AI summaries — one row per unique blob sha (git blob hash).
  // Any edit produces a new row; any unchanged blob reuses the summary forever.
  await db`
    CREATE TABLE IF NOT EXISTS file_summaries (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      file_path TEXT NOT NULL,
      blob_sha TEXT NOT NULL,
      summary TEXT,
      provider TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      failed_at TIMESTAMPTZ,
      failure_reason TEXT
    )
  `;
  await ignoreDbError(db`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_summaries_blob
    ON file_summaries(owner, repo, file_path, blob_sha)
  `);
  // Per-user last-viewed-commit tracking for "what changed since you last viewed".
  await db`
    CREATE TABLE IF NOT EXISTS file_views (
      user_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      file_path TEXT NOT NULL,
      last_viewed_sha TEXT NOT NULL,
      last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_viewed_blob_sha TEXT,
      PRIMARY KEY (user_id, owner, repo, file_path)
    )
  `;
  await ignoreDbError(db`
    ALTER TABLE file_views ADD COLUMN IF NOT EXISTS last_viewed_blob_sha TEXT
  `);
  await ignoreDbError(db`
    CREATE INDEX IF NOT EXISTS idx_file_views_user
    ON file_views(user_id, last_viewed_at DESC)
  `);
  // Per-commit diff summaries shared across users.
  await db`
    CREATE TABLE IF NOT EXISTS file_commit_summaries (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      file_path TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      parent_sha TEXT,
      summary TEXT,
      provider TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      failed_at TIMESTAMPTZ,
      failure_reason TEXT
    )
  `;
  await ignoreDbError(db`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_commit_summaries_commit
    ON file_commit_summaries(owner, repo, file_path, commit_sha)
  `);
  // Per-section content hashes for inline "changed since you last viewed" highlights.
  await db`
    CREATE TABLE IF NOT EXISTS file_section_hashes (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      file_path TEXT NOT NULL,
      blob_sha TEXT NOT NULL,
      section_slug TEXT NOT NULL,
      heading TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      PRIMARY KEY (owner, repo, file_path, blob_sha, section_slug)
    )
  `;
}

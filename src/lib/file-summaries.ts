import { createHash } from "node:crypto";
import { getDb, withDbRetry } from "./db";
import { generateAiText, getAiStatus } from "./ai";

export interface FileSummary {
  owner: string;
  repo: string;
  filePath: string;
  blobSha: string;
  summary: string;
  provider: string;
  model: string;
  createdAt: Date;
}

/** Minimum content length (after stripping frontmatter) to bother summarizing. */
const MIN_CONTENT_CHARS = 200;

/** Maximum content length sent to the model. Truncated summaries are still useful. */
const MAX_INPUT_CHARS = 30_000;

/** Max tokens to request from the model for a single summary. */
const SUMMARY_MAX_OUTPUT_TOKENS = 300;

/** Back off for 1h after a failed generation to avoid hammering the API. */
const FAIL_BACKOFF_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT =
  "You summarize technical markdown documents for a teammate scanning a doc " +
  "index. Return a short TL;DR focused on what the reader will learn or find " +
  "in the document. Plain prose. No preamble, no markdown, no headings.";

/**
 * Compute a git-compatible blob SHA1 for a string of content.
 * Git stores blobs as `blob <bytelen>\0<content>`, then SHA-1s the whole thing.
 * Matches the `sha` field GitHub returns in the git tree API, so cached
 * summaries look up the same regardless of whether the caller fetched the tree.
 */
export function computeBlobSha(content: string): string {
  const buf = Buffer.from(content, "utf8");
  const hash = createHash("sha1");
  hash.update(`blob ${buf.length}\0`);
  hash.update(buf);
  return hash.digest("hex");
}

/** Strip YAML frontmatter and normalize whitespace for length/content checks. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

interface SummaryRow {
  summary: string | null;
  provider: string | null;
  model: string | null;
  created_at: Date;
  failed_at: Date | null;
}

async function fetchCachedRow(
  owner: string,
  repo: string,
  filePath: string,
  blobSha: string,
): Promise<SummaryRow | null> {
  const rows = await withDbRetry(
    () => getDb()<SummaryRow[]>`
      SELECT summary, provider, model, created_at, failed_at
      FROM file_summaries
      WHERE owner = ${owner}
        AND repo = ${repo}
        AND file_path = ${filePath}
        AND blob_sha = ${blobSha}
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

function rowToSummary(
  owner: string,
  repo: string,
  filePath: string,
  blobSha: string,
  row: SummaryRow,
): FileSummary | null {
  if (!row.summary || !row.provider || !row.model) return null;
  return {
    owner,
    repo,
    filePath,
    blobSha,
    summary: row.summary,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  };
}

/**
 * Look up a cached summary without generating one. Safe to call from
 * unauthenticated contexts. Returns null on cache miss.
 */
export async function getFileSummary(params: {
  owner: string;
  repo: string;
  filePath: string;
  blobSha: string;
}): Promise<FileSummary | null> {
  const row = await fetchCachedRow(
    params.owner,
    params.repo,
    params.filePath,
    params.blobSha,
  );
  if (!row) return null;
  return rowToSummary(params.owner, params.repo, params.filePath, params.blobSha, row);
}

async function recordFailure(
  owner: string,
  repo: string,
  filePath: string,
  blobSha: string,
  reason: string,
): Promise<void> {
  await withDbRetry(
    () => getDb()`
      INSERT INTO file_summaries (
        owner, repo, file_path, blob_sha, failed_at, failure_reason
      )
      VALUES (${owner}, ${repo}, ${filePath}, ${blobSha}, NOW(), ${reason})
      ON CONFLICT (owner, repo, file_path, blob_sha) DO UPDATE
      SET failed_at = NOW(),
          failure_reason = EXCLUDED.failure_reason
    `,
  );
}

/**
 * Look up a cached summary or generate and store one. Returns null when AI is
 * disabled, the file is too small to summarize, generation failed, or the last
 * failure is still inside the backoff window.
 */
export async function getOrCreateFileSummary(params: {
  owner: string;
  repo: string;
  filePath: string;
  blobSha: string;
  content: string;
}): Promise<FileSummary | null> {
  const { owner, repo, filePath, blobSha, content } = params;

  const existing = await fetchCachedRow(owner, repo, filePath, blobSha);
  if (existing) {
    const cached = rowToSummary(owner, repo, filePath, blobSha, existing);
    if (cached) return cached;
    if (existing.failed_at) {
      const elapsed = Date.now() - existing.failed_at.getTime();
      if (elapsed < FAIL_BACKOFF_MS) return null;
    }
  }

  const stripped = stripFrontmatter(content);
  if (stripped.length < MIN_CONTENT_CHARS) return null;

  if (!getAiStatus().enabled) return null;

  const input = stripped.slice(0, MAX_INPUT_CHARS);
  const result = await generateAiText({
    system: SYSTEM_PROMPT,
    prompt: `Document path: ${filePath}\n\n${input}`,
    maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
  });

  if (!result || !result.text) {
    await recordFailure(owner, repo, filePath, blobSha, "generation returned empty");
    return null;
  }

  await withDbRetry(
    () => getDb()`
      INSERT INTO file_summaries (
        owner, repo, file_path, blob_sha,
        summary, provider, model,
        input_tokens, output_tokens, duration_ms
      )
      VALUES (
        ${owner}, ${repo}, ${filePath}, ${blobSha},
        ${result.text}, ${result.provider}, ${result.model},
        ${result.inputTokens}, ${result.outputTokens}, ${result.durationMs}
      )
      ON CONFLICT (owner, repo, file_path, blob_sha) DO UPDATE
      SET summary = EXCLUDED.summary,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          duration_ms = EXCLUDED.duration_ms,
          failed_at = NULL,
          failure_reason = NULL,
          created_at = NOW()
    `,
  );

  return {
    owner,
    repo,
    filePath,
    blobSha,
    summary: result.text,
    provider: result.provider,
    model: result.model,
    createdAt: new Date(),
  };
}

import { createTwoFilesPatch } from "diff";
import { getDb, withDbRetry } from "./db";
import { generateAiText, getAiStatus } from "./ai";
import { getFileAtCommit, getFileHistory, type FileCommit } from "./github";

/** Max file-history entries considered for the digest. Falls out of cache. */
const HISTORY_COMMIT_LIMIT = 30;

/** Upper bound on the number of commits we'll summarize for a single digest. */
const MAX_COMMITS_IN_DIGEST = 10;

/** Diff input is truncated to keep prompts cheap. */
const MAX_DIFF_CHARS = 20_000;

/** If the user's last-viewed sha isn't in the history (force-push, deep history), how many recent commits to show instead. */
const FALLBACK_COMMIT_COUNT = 5;

/** For first-ever views (no prior tracking) show the latest N commits so the user still gets useful context. */
const FIRST_VIEW_COMMIT_COUNT = 3;

/** Threshold at which the digest switches from bullet list to synthesized paragraph. */
const SYNTHESIS_THRESHOLD = 3;

/** Backoff for failed commit summaries. */
const FAIL_BACKOFF_MS = 60 * 60 * 1000;

const COMMIT_SYSTEM_PROMPT =
  "You summarize a single edit to a markdown document. Given a unified diff, " +
  "return one short sentence describing the substantive change (content, " +
  "meaning, structure). Ignore pure whitespace or formatting shifts. No " +
  "preamble, no markdown, plain prose.";

const SYNTHESIS_SYSTEM_PROMPT =
  "You combine a list of per-commit edit notes for a single document into a " +
  "short summary (2-3 sentences) describing what changed overall since the " +
  "reader last viewed the document. No preamble, no markdown, plain prose.";

export interface CommitBullet {
  sha: string;
  shortSha: string;
  summary: string;
  date: string;
  author: {
    login: string;
    avatarUrl: string;
  };
  messageFirstLine: string;
}

export interface ChangeDigest {
  fromSha: string | null;
  toSha: string;
  bullets: CommitBullet[];
  synthesis: string | null;
  /** True if the user's last-viewed sha wasn't in history; the range is an approximation. */
  approximate: boolean;
  /** True when this is a first-ever view for the user — label changes accordingly. */
  isFirstView: boolean;
}


interface CommitSummaryRow {
  summary: string | null;
  provider: string | null;
  model: string | null;
  failed_at: Date | null;
}

async function fetchCommitSummaryRow(
  owner: string,
  repo: string,
  filePath: string,
  commitSha: string,
): Promise<CommitSummaryRow | null> {
  const rows = await withDbRetry(
    () => getDb()<CommitSummaryRow[]>`
      SELECT summary, provider, model, failed_at
      FROM file_commit_summaries
      WHERE owner = ${owner}
        AND repo = ${repo}
        AND file_path = ${filePath}
        AND commit_sha = ${commitSha}
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

function buildDiffInput(
  filePath: string,
  commitSha: string,
  parentSha: string | null,
  previousContent: string,
  nextContent: string,
): string {
  const oldLabel = parentSha ? `${filePath} @ ${parentSha.slice(0, 7)}` : `${filePath} (new file)`;
  const newLabel = `${filePath} @ ${commitSha.slice(0, 7)}`;
  const patch = createTwoFilesPatch(
    oldLabel,
    newLabel,
    previousContent,
    nextContent,
    "",
    "",
    { context: 3 },
  );
  return patch.slice(0, MAX_DIFF_CHARS);
}

async function recordCommitSummaryFailure(
  owner: string,
  repo: string,
  filePath: string,
  commitSha: string,
  parentSha: string | null,
  reason: string,
): Promise<void> {
  await withDbRetry(
    () => getDb()`
      INSERT INTO file_commit_summaries (
        owner, repo, file_path, commit_sha, parent_sha, failed_at, failure_reason
      )
      VALUES (${owner}, ${repo}, ${filePath}, ${commitSha}, ${parentSha}, NOW(), ${reason})
      ON CONFLICT (owner, repo, file_path, commit_sha) DO UPDATE
      SET failed_at = NOW(), failure_reason = EXCLUDED.failure_reason
    `,
  );
}

/**
 * Look up or generate a single-commit diff summary. Returns null when:
 * - AI is disabled
 * - The content fetch fails
 * - Generation fails (records a failure row with backoff)
 */
export async function getOrCreateCommitSummary(params: {
  accessToken: string;
  owner: string;
  repo: string;
  filePath: string;
  commitSha: string;
  parentSha: string | null;
}): Promise<string | null> {
  const { accessToken, owner, repo, filePath, commitSha, parentSha } = params;

  const cached = await fetchCommitSummaryRow(owner, repo, filePath, commitSha);
  if (cached?.summary) return cached.summary;
  if (cached?.failed_at) {
    const elapsed = Date.now() - cached.failed_at.getTime();
    if (elapsed < FAIL_BACKOFF_MS) return null;
  }

  if (!getAiStatus().enabled) return null;

  const [nextContent, previousContent] = await Promise.all([
    getFileAtCommit(accessToken, owner, repo, commitSha, filePath),
    parentSha
      ? getFileAtCommit(accessToken, owner, repo, parentSha, filePath)
      : Promise.resolve(""),
  ]);

  if (nextContent === null) {
    await recordCommitSummaryFailure(
      owner,
      repo,
      filePath,
      commitSha,
      parentSha,
      "file content unavailable",
    );
    return null;
  }

  const diffInput = buildDiffInput(
    filePath,
    commitSha,
    parentSha,
    previousContent ?? "",
    nextContent,
  );

  const result = await generateAiText({
    system: COMMIT_SYSTEM_PROMPT,
    prompt: `Unified diff for ${filePath}:\n\n${diffInput}`,
    maxOutputTokens: 200,
  });

  if (!result || !result.text) {
    await recordCommitSummaryFailure(
      owner,
      repo,
      filePath,
      commitSha,
      parentSha,
      "generation returned empty",
    );
    return null;
  }

  await withDbRetry(
    () => getDb()`
      INSERT INTO file_commit_summaries (
        owner, repo, file_path, commit_sha, parent_sha,
        summary, provider, model,
        input_tokens, output_tokens, duration_ms
      )
      VALUES (
        ${owner}, ${repo}, ${filePath}, ${commitSha}, ${parentSha},
        ${result.text}, ${result.provider}, ${result.model},
        ${result.inputTokens}, ${result.outputTokens}, ${result.durationMs}
      )
      ON CONFLICT (owner, repo, file_path, commit_sha) DO UPDATE
      SET summary = EXCLUDED.summary,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          parent_sha = EXCLUDED.parent_sha,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          duration_ms = EXCLUDED.duration_ms,
          failed_at = NULL,
          failure_reason = NULL,
          created_at = NOW()
    `,
  );

  return result.text;
}

/**
 * Record that a user has viewed a specific version of a file. Returns the
 * previously-recorded sha (if any) so the caller can compute what changed
 * between views. Safe to call on every page load.
 */
export interface FileViewBaseline {
  /** The commit sha the user has "acknowledged" — set on explicit dismiss, not on page load. */
  commitSha: string | null;
  /** The blob sha matching that acknowledged commit, used for section-level diffs. */
  blobSha: string | null;
}

/**
 * Read-only baseline lookup. Returns what the user last "acknowledged"
 * (dismissed), not what they most recently loaded. Every page view calls
 * this to compute the diff, but no write happens here — so refreshes don't
 * advance the baseline and the banner keeps showing until the user dismisses.
 */
export async function getFileViewBaseline(params: {
  userId: string;
  owner: string;
  repo: string;
  filePath: string;
}): Promise<FileViewBaseline> {
  const { userId, owner, repo, filePath } = params;

  const rows = await withDbRetry(
    () => getDb()<{ last_viewed_sha: string; last_viewed_blob_sha: string | null }[]>`
      SELECT last_viewed_sha, last_viewed_blob_sha
      FROM file_views
      WHERE user_id = ${userId}
        AND owner = ${owner}
        AND repo = ${repo}
        AND file_path = ${filePath}
      LIMIT 1
    `,
  );

  return {
    commitSha: rows[0]?.last_viewed_sha ?? null,
    blobSha: rows[0]?.last_viewed_blob_sha ?? null,
  };
}

/**
 * Advance the baseline to a new (commit, blob) pair. Called on explicit
 * user action — dismissing the change-digest banner. UPSERT so the first
 * dismiss inserts the row, subsequent dismisses update it.
 */
export async function advanceFileView(params: {
  userId: string;
  owner: string;
  repo: string;
  filePath: string;
  commitSha: string;
  blobSha: string;
}): Promise<void> {
  const { userId, owner, repo, filePath, commitSha, blobSha } = params;
  await withDbRetry(
    () => getDb()`
      INSERT INTO file_views (user_id, owner, repo, file_path, last_viewed_sha, last_viewed_blob_sha)
      VALUES (${userId}, ${owner}, ${repo}, ${filePath}, ${commitSha}, ${blobSha})
      ON CONFLICT (user_id, owner, repo, file_path) DO UPDATE
      SET last_viewed_sha = EXCLUDED.last_viewed_sha,
          last_viewed_blob_sha = EXCLUDED.last_viewed_blob_sha,
          last_viewed_at = NOW()
    `,
  );
}

function selectNewCommits(
  commits: FileCommit[],
  previousSha: string | null,
): { newCommits: FileCommit[]; approximate: boolean; isFirstView: boolean } {
  if (!previousSha) {
    return {
      newCommits: commits.slice(0, Math.min(FIRST_VIEW_COMMIT_COUNT, commits.length)),
      approximate: false,
      isFirstView: true,
    };
  }
  const index = commits.findIndex((c) => c.sha === previousSha);
  if (index === -1) {
    return {
      newCommits: commits.slice(0, Math.min(FALLBACK_COMMIT_COUNT, commits.length)),
      approximate: true,
      isFirstView: false,
    };
  }
  return {
    newCommits: commits.slice(0, index),
    approximate: false,
    isFirstView: false,
  };
}

function toBullet(commit: FileCommit, summary: string): CommitBullet {
  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    summary,
    date: commit.date,
    author: { login: commit.author.login, avatarUrl: commit.author.avatar_url },
    messageFirstLine: commit.message,
  };
}

async function synthesizeDigest(bullets: CommitBullet[]): Promise<string | null> {
  const prompt = bullets.map((b, i) => `${i + 1}. ${b.summary}`).join("\n");
  const result = await generateAiText({
    system: SYNTHESIS_SYSTEM_PROMPT,
    prompt: `Edit notes (newest first):\n\n${prompt}`,
    maxOutputTokens: 300,
  });
  return result?.text ?? null;
}

/**
 * Assemble a change digest between two commits on a file. Pure — does NOT
 * touch file_views, so it can be called from a lazy client-triggered endpoint
 * without a race against the view tracking that SSR already recorded.
 *
 * When `fromCommitSha` is null this is treated as a first-ever view and the
 * digest returns the latest few commits so the reader still gets helpful
 * context. The client uses `isFirstView` to switch the banner label.
 *
 * Returns null when:
 * - AI is disabled
 * - The file history is empty
 * - fromCommitSha === toCommitSha (no changes since last view)
 * - No commits are found to summarize
 * - Every per-commit summary generation failed
 */
export async function assembleChangeDigest(params: {
  accessToken: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  fromCommitSha: string | null;
  toCommitSha: string;
}): Promise<ChangeDigest | null> {
  const { accessToken, owner, repo, branch, filePath, fromCommitSha, toCommitSha } = params;

  if (fromCommitSha && fromCommitSha === toCommitSha) return null;
  if (!getAiStatus().enabled) return null;

  const history = await getFileHistory(accessToken, owner, repo, branch, filePath);
  if (history.length === 0) return null;

  const limited = history.slice(0, HISTORY_COMMIT_LIMIT);
  const { newCommits, approximate, isFirstView } = selectNewCommits(limited, fromCommitSha);
  if (newCommits.length === 0) return null;

  const capped = newCommits.slice(0, MAX_COMMITS_IN_DIGEST);

  const summaries = await Promise.all(
    capped.map(async (commit, idx) => {
      const parentFromCapped = capped[idx + 1]?.sha;
      const parentFromHistory = limited[limited.indexOf(commit) + 1]?.sha;
      const parentSha = parentFromCapped ?? parentFromHistory ?? null;
      const summary = await getOrCreateCommitSummary({
        accessToken,
        owner,
        repo,
        filePath,
        commitSha: commit.sha,
        parentSha,
      });
      return summary ? toBullet(commit, summary) : null;
    }),
  );

  const bullets = summaries.filter((s): s is CommitBullet => s !== null);
  if (bullets.length === 0) return null;

  let synthesis: string | null = null;
  if (bullets.length > SYNTHESIS_THRESHOLD) {
    synthesis = await synthesizeDigest(bullets);
  }

  return {
    fromSha: fromCommitSha,
    toSha: toCommitSha,
    bullets,
    synthesis,
    approximate,
    isFirstView,
  };
}

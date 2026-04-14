import { diffLines } from "diff";
import matter from "gray-matter";
import { getFileAtCommit, getFileHistory } from "./github";
import { getFileViewBaseline } from "./change-digest";
import {
  diffSectionHashes,
  extractSectionHashes,
  getSectionHashes,
  storeSectionHashes,
} from "./section-hashes";

/**
 * Everything the viewer needs to render change affordances for a user on a
 * specific file, computed in one place:
 *
 * - `currentCommitSha`: latest commit touching the file (drives the banner's
 *   dismiss key and the API's "to" param).
 * - `previousCommitSha`: the sha the user has explicitly acknowledged. Null
 *   when the user has never dismissed a banner for this file. Passed to the
 *   banner as `fromCommitSha`.
 * - `changedSectionSlugs` / `newSectionSlugs`: heading slugs to mark with the
 *   section-level left rail.
 * - `textChangedLines`: 1-indexed line numbers (in the post-frontmatter
 *   content, which is what react-markdown sees) for block-level highlights.
 *
 * Semantics are consistent across the three affordances:
 *
 * 1. User has never dismissed (`previousCommitSha === null`): diff against
 *    the parent commit so first-time readers see the most recent edit.
 * 2. User dismissed an older commit (`previousCommitSha !== currentCommitSha`):
 *    diff against the acknowledged commit — "what's new since you last saw it".
 * 3. User dismissed the current commit (`previousCommitSha === currentCommitSha`):
 *    nothing to show. Banner is hidden, highlights are empty.
 */
export interface ViewInsights {
  currentCommitSha: string | null;
  previousCommitSha: string | null;
  changedSectionSlugs: Set<string>;
  newSectionSlugs: Set<string>;
  textChangedLines: Set<number>;
}

const EMPTY: ViewInsights = {
  currentCommitSha: null,
  previousCommitSha: null,
  changedSectionSlugs: new Set(),
  newSectionSlugs: new Set(),
  textChangedLines: new Set(),
};

/**
 * Main entry point called from the viewer's server component. Never throws —
 * on any error returns EMPTY insights so the page still renders cleanly.
 */
export async function computeViewInsights(params: {
  accessToken: string;
  userId: string | null;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  /** Post-frontmatter content (what react-markdown sees). */
  currentContent: string;
  /** Raw file content including frontmatter (used for section hash extraction). */
  currentRawContent: string;
  /** Authoritative blob sha from the git tree, or a locally-computed fallback. */
  currentBlobSha: string;
}): Promise<ViewInsights> {
  const {
    accessToken,
    userId,
    owner,
    repo,
    branch,
    filePath,
    currentContent,
    currentRawContent,
    currentBlobSha,
  } = params;

  if (!userId) return EMPTY;

  try {
    // Round 1: history + baseline can run in parallel. Both are reads; neither
    // blocks the other. Section-hash storage kicks off in parallel as a pure
    // optimization for future reads and its failure must never break render.
    const [history, baseline] = await Promise.all([
      getFileHistory(accessToken, owner, repo, branch, filePath),
      getFileViewBaseline({ userId, owner, repo, filePath }),
    ]);

    // Fire-and-forget hash storage. Await-less, with an explicit catch so an
    // exception can't become an unhandled rejection. Next.js awaits all
    // promises spawned during a server component render before sending the
    // response, so this still completes before the user sees anything.
    void storeSectionHashes({
      owner,
      repo,
      filePath,
      blobSha: currentBlobSha,
      content: currentRawContent,
    }).catch((err) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[view-insights] storeSectionHashes failed:`, err);
      }
    });

    const currentCommitSha = history[0]?.sha ?? null;
    if (!currentCommitSha) {
      return { ...EMPTY, previousCommitSha: baseline.commitSha };
    }

    // Banner + highlights share this decision so they stay consistent: if
    // the user has acknowledged the current commit, both affordances are empty.
    const diffSourceCommitSha = resolveDiffSource(
      baseline.commitSha,
      currentCommitSha,
      history[1]?.sha ?? null,
    );

    if (!diffSourceCommitSha) {
      return {
        ...EMPTY,
        currentCommitSha,
        previousCommitSha: baseline.commitSha,
      };
    }

    // Round 2: fetch the baseline blob's content + (optionally) its stored
    // section hashes in parallel. getFileAtCommit is Next-cached so repeated
    // views of the same (commit, path) are free.
    const [baselineRawContent, storedBaselineHashes] = await Promise.all([
      getFileAtCommit(accessToken, owner, repo, diffSourceCommitSha, filePath),
      baseline.blobSha
        ? getSectionHashes({
            owner,
            repo,
            filePath,
            blobSha: baseline.blobSha,
          }).catch(() => [])
        : Promise.resolve([] as Awaited<ReturnType<typeof getSectionHashes>>),
    ]);

    if (baselineRawContent === null) {
      return {
        ...EMPTY,
        currentCommitSha,
        previousCommitSha: baseline.commitSha,
      };
    }

    // Section-level diff. Prefer pre-stored hashes for the user's baseline
    // blob (first-view flow has no row so this is empty → we extract below).
    const baselineSectionHashes =
      storedBaselineHashes.length > 0
        ? storedBaselineHashes
        : extractSectionHashes(baselineRawContent);
    const currentSectionHashes = extractSectionHashes(currentRawContent);
    const sectionDiff = diffSectionHashes(baselineSectionHashes, currentSectionHashes);

    // Text-line diff against the baseline's post-frontmatter content so the
    // line numbers match react-markdown's node.position for block overrides.
    const baselineContent = stripFrontmatter(baselineRawContent);
    const textChangedLines = computeTextChangedLines(baselineContent, currentContent);

    return {
      currentCommitSha,
      previousCommitSha: baseline.commitSha,
      changedSectionSlugs: new Set(sectionDiff.changedSlugs),
      newSectionSlugs: new Set(sectionDiff.newSlugs),
      textChangedLines,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[view-insights] ${filePath} failed:`, err);
    }
    return EMPTY;
  }
}

/**
 * Resolve the commit sha to diff against given:
 *  - the user's acknowledged baseline (may be null)
 *  - the current commit
 *  - the previous commit touching this file (parent fallback)
 *
 * Returns null when the user has already acknowledged the current commit —
 * the caller must then render nothing.
 */
export function resolveDiffSource(
  baselineCommitSha: string | null,
  currentCommitSha: string,
  parentCommitSha: string | null,
): string | null {
  if (!baselineCommitSha) {
    // First-ever view: diff against parent so first-time readers see the
    // most recent edit. Null if this is the only commit touching the file.
    return parentCommitSha;
  }
  if (baselineCommitSha === currentCommitSha) {
    // User has acknowledged the current version. Nothing to show.
    return null;
  }
  // User has a stale baseline — diff against it so they see what they missed.
  return baselineCommitSha;
}

function stripFrontmatter(raw: string): string {
  try {
    return matter(raw).content;
  } catch {
    return raw;
  }
}

/**
 * Build a Set of 1-indexed line numbers (in `currentContent`) that were added
 * or modified relative to `baselineContent`. These match the positions that
 * remark attaches to hast nodes via `node.position.start.line` / `end.line`.
 */
export function computeTextChangedLines(
  baselineContent: string,
  currentContent: string,
): Set<number> {
  const changedLines = new Set<number>();
  const changes = diffLines(baselineContent, currentContent);
  let currentLine = 1;
  for (const change of changes) {
    const lineCount = countLines(change.value);
    if (change.added) {
      for (let i = 0; i < lineCount; i++) {
        changedLines.add(currentLine + i);
      }
    }
    // `removed` parts don't advance the current-line pointer; `added` and
    // unchanged parts do.
    if (!change.removed) {
      currentLine += lineCount;
    }
  }
  return changedLines;
}

/** diffLines parts typically end with a trailing newline we must not count. */
function countLines(value: string): number {
  if (value.length === 0) return 0;
  const parts = value.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts.length;
}

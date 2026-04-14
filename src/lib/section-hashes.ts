import { createHash } from "node:crypto";
import { getDb, withDbRetry } from "./db";
import { slugifyHeading } from "./markdown";

/** A single heading-scoped section of a markdown document. */
export interface SectionHash {
  slug: string;
  heading: string;
  /** sha256 hex of the section body (headings H1–H3 only; child content until the next heading at any level). */
  contentHash: string;
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/;

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Deterministically produce a unique slug for each section even when the
 * document has multiple headings with the same text. Uses a `-2`, `-3`
 * suffix pattern to match how common markdown renderers disambiguate.
 */
function uniqueSlug(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

/**
 * Parse markdown into H1–H3-scoped sections and hash each section's body.
 * Frontmatter is stripped up front so equivalent bodies produce the same
 * hash regardless of trivial frontmatter edits (e.g. updated dates).
 *
 * Content before the first heading is ignored — it has nothing to anchor to.
 */
export function extractSectionHashes(markdown: string): SectionHash[] {
  const stripped = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const lines = stripped.split(/\r?\n/);
  const sections: SectionHash[] = [];
  const seenSlugs = new Map<string, number>();

  let currentHeading: string | null = null;
  let currentSlug: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentSlug && currentHeading !== null) {
      sections.push({
        slug: currentSlug,
        heading: currentHeading,
        contentHash: hashBody(currentBody.join("\n").trim()),
      });
    }
  };

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      flush();
      const raw = match[2].replace(/[*_`~[\]]/g, "");
      currentHeading = raw;
      currentSlug = uniqueSlug(slugifyHeading(raw), seenSlugs);
      currentBody = [];
    } else if (currentSlug !== null) {
      currentBody.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * Persist the section hashes for a given blob. Idempotent — unique index on
 * (owner, repo, file_path, blob_sha, section_slug) means re-running is a no-op.
 */
export async function storeSectionHashes(params: {
  owner: string;
  repo: string;
  filePath: string;
  blobSha: string;
  content: string;
}): Promise<SectionHash[]> {
  const { owner, repo, filePath, blobSha, content } = params;
  const hashes = extractSectionHashes(content);
  if (hashes.length === 0) return [];

  // Bulk insert in one statement using UNNEST for efficiency.
  const slugs = hashes.map((h) => h.slug);
  const headings = hashes.map((h) => h.heading);
  const contentHashes = hashes.map((h) => h.contentHash);

  await withDbRetry(
    () => getDb()`
      INSERT INTO file_section_hashes (
        owner, repo, file_path, blob_sha, section_slug, heading, content_hash
      )
      SELECT ${owner}, ${repo}, ${filePath}, ${blobSha}, slug, heading, hash
      FROM UNNEST(
        ${slugs}::text[],
        ${headings}::text[],
        ${contentHashes}::text[]
      ) AS t(slug, heading, hash)
      ON CONFLICT (owner, repo, file_path, blob_sha, section_slug) DO NOTHING
    `,
  );

  return hashes;
}

/** Read cached section hashes for a blob. Empty array on cache miss. */
export async function getSectionHashes(params: {
  owner: string;
  repo: string;
  filePath: string;
  blobSha: string;
}): Promise<SectionHash[]> {
  const { owner, repo, filePath, blobSha } = params;
  const rows = await withDbRetry(
    () => getDb()<{ section_slug: string; heading: string; content_hash: string }[]>`
      SELECT section_slug, heading, content_hash
      FROM file_section_hashes
      WHERE owner = ${owner}
        AND repo = ${repo}
        AND file_path = ${filePath}
        AND blob_sha = ${blobSha}
    `,
  );
  return rows.map((r) => ({
    slug: r.section_slug,
    heading: r.heading,
    contentHash: r.content_hash,
  }));
}

export interface SectionDiff {
  /** Slugs present in both blobs but with different content. */
  changedSlugs: string[];
  /** Slugs present in the new blob but not the old blob. */
  newSlugs: string[];
}

/** Pure diff between two section hash sets. Order is not meaningful. */
export function diffSectionHashes(previous: SectionHash[], current: SectionHash[]): SectionDiff {
  const previousMap = new Map(previous.map((s) => [s.slug, s.contentHash]));
  const changedSlugs: string[] = [];
  const newSlugs: string[] = [];
  for (const section of current) {
    const prior = previousMap.get(section.slug);
    if (prior === undefined) {
      newSlugs.push(section.slug);
    } else if (prior !== section.contentHash) {
      changedSlugs.push(section.slug);
    }
  }
  return { changedSlugs, newSlugs };
}

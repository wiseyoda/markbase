// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  diffSectionHashes,
  extractSectionHashes,
  getSectionHashes,
  storeSectionHashes,
} from "@/lib/section-hashes";
import { useTestDatabase } from "../../helpers/postgres";

describe("section hashes storage", () => {
  useTestDatabase();

  beforeEach(async () => {
    await getDb()`TRUNCATE TABLE file_section_hashes`;
  });

  it("stores and retrieves hashes for a blob", async () => {
    const content = `# Intro\nhello\n## Install\nsteps\n## Use\nexamples`;
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "README.md",
      blobSha: "blob-1",
      content,
    });

    const stored = await getSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "README.md",
      blobSha: "blob-1",
    });

    expect(stored).toHaveLength(3);
    const bySlug = new Map(stored.map((s) => [s.slug, s]));
    expect(bySlug.get("intro")?.heading).toBe("Intro");
    expect(bySlug.get("install")?.heading).toBe("Install");
    expect(bySlug.get("use")?.heading).toBe("Use");
  });

  it("is idempotent on repeated stores", async () => {
    const content = `# A\nbody\n## B\nother`;
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      blobSha: "blob-1",
      content,
    });
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      blobSha: "blob-1",
      content,
    });
    const stored = await getSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      blobSha: "blob-1",
    });
    expect(stored).toHaveLength(2);
  });

  it("returns an empty array when no hashes exist", async () => {
    const stored = await getSectionHashes({
      owner: "none",
      repo: "none",
      filePath: "none.md",
      blobSha: "zzz",
    });
    expect(stored).toEqual([]);
  });

  it("stores different blobs independently", async () => {
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      blobSha: "blob-1",
      content: `# A\nfirst version`,
    });
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      blobSha: "blob-2",
      content: `# A\nsecond version`,
    });
    const [blob1, blob2] = await Promise.all([
      getSectionHashes({
        owner: "acme",
        repo: "widgets",
        filePath: "a.md",
        blobSha: "blob-1",
      }),
      getSectionHashes({
        owner: "acme",
        repo: "widgets",
        filePath: "a.md",
        blobSha: "blob-2",
      }),
    ]);
    expect(blob1[0].contentHash).not.toBe(blob2[0].contentHash);
  });

  it("round-trips through diffSectionHashes to detect real changes", async () => {
    const v1 = `# Overview\nOriginal copy.\n## Setup\nsame\n## Known issues\nfirst`;
    const v2 = `# Overview\nOriginal copy.\n## Setup\nsame\n## Known issues\nupdated\n## FAQ\nnew`;

    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "notes.md",
      blobSha: "blob-v1",
      content: v1,
    });
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "notes.md",
      blobSha: "blob-v2",
      content: v2,
    });

    const [prev, curr] = await Promise.all([
      getSectionHashes({
        owner: "acme",
        repo: "widgets",
        filePath: "notes.md",
        blobSha: "blob-v1",
      }),
      // Use the extraction path to simulate SSR comparison
      Promise.resolve(extractSectionHashes(v2)),
    ]);

    const diff = diffSectionHashes(prev, curr);
    expect(diff.changedSlugs).toEqual(["known-issues"]);
    expect(diff.newSlugs).toEqual(["faq"]);
  });
});

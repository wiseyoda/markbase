// @vitest-environment node

import { describe, expect, it } from "vitest";
import { diffSectionHashes, extractSectionHashes } from "@/lib/section-hashes";

describe("extractSectionHashes", () => {
  it("returns an empty array for markdown with no headings", () => {
    expect(extractSectionHashes("just some text")).toEqual([]);
  });

  it("strips frontmatter before parsing", () => {
    const withFrontmatter = `---\ntitle: x\n---\n# Heading\nbody`;
    const without = `# Heading\nbody`;
    expect(extractSectionHashes(withFrontmatter)[0].contentHash).toBe(
      extractSectionHashes(without)[0].contentHash,
    );
  });

  it("produces a section per heading at H1, H2, H3", () => {
    const md = `# Alpha\nfirst\n## Beta\nsecond\n### Gamma\nthird`;
    const sections = extractSectionHashes(md);
    expect(sections.map((s) => s.heading)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sections.map((s) => s.slug)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("ignores content above the first heading", () => {
    const md = `prelude\n\n# Heading\nbody`;
    const [section] = extractSectionHashes(md);
    expect(section.heading).toBe("Heading");
  });

  it("disambiguates duplicate slugs with numeric suffixes", () => {
    const md = `# Intro\nalpha\n## Intro\nbeta\n## Intro\ngamma`;
    const slugs = extractSectionHashes(md).map((s) => s.slug);
    expect(slugs).toEqual(["intro", "intro-2", "intro-3"]);
  });

  it("produces identical hashes for unchanged section bodies", () => {
    const v1 = `# A\nbody\n## B\nsame`;
    const v2 = `# A\ndifferent body\n## B\nsame`;
    const s1 = extractSectionHashes(v1);
    const s2 = extractSectionHashes(v2);
    expect(s1[0].contentHash).not.toBe(s2[0].contentHash);
    expect(s1[1].contentHash).toBe(s2[1].contentHash);
  });

  it("normalizes trailing whitespace when hashing", () => {
    const s1 = extractSectionHashes(`# A\nbody\n\n`);
    const s2 = extractSectionHashes(`# A\nbody`);
    expect(s1[0].contentHash).toBe(s2[0].contentHash);
  });

  it("handles CRLF line endings", () => {
    const crlf = `# A\r\nbody\r\n## B\r\nother`;
    const lf = `# A\nbody\n## B\nother`;
    expect(
      extractSectionHashes(crlf).map((s) => s.contentHash),
    ).toEqual(extractSectionHashes(lf).map((s) => s.contentHash));
  });
});

describe("diffSectionHashes", () => {
  it("flags added sections as new", () => {
    const prev = [{ slug: "a", heading: "A", contentHash: "h1" }];
    const curr = [
      { slug: "a", heading: "A", contentHash: "h1" },
      { slug: "b", heading: "B", contentHash: "h2" },
    ];
    const diff = diffSectionHashes(prev, curr);
    expect(diff.newSlugs).toEqual(["b"]);
    expect(diff.changedSlugs).toEqual([]);
  });

  it("flags updated sections as changed", () => {
    const prev = [
      { slug: "a", heading: "A", contentHash: "h1" },
      { slug: "b", heading: "B", contentHash: "h2" },
    ];
    const curr = [
      { slug: "a", heading: "A", contentHash: "h1-updated" },
      { slug: "b", heading: "B", contentHash: "h2" },
    ];
    const diff = diffSectionHashes(prev, curr);
    expect(diff.changedSlugs).toEqual(["a"]);
    expect(diff.newSlugs).toEqual([]);
  });

  it("returns empty diffs for identical section sets", () => {
    const sections = [{ slug: "a", heading: "A", contentHash: "h" }];
    const diff = diffSectionHashes(sections, sections);
    expect(diff.changedSlugs).toEqual([]);
    expect(diff.newSlugs).toEqual([]);
  });

  it("ignores removed sections (not surfaced)", () => {
    const prev = [
      { slug: "a", heading: "A", contentHash: "h1" },
      { slug: "b", heading: "B", contentHash: "h2" },
    ];
    const curr = [{ slug: "a", heading: "A", contentHash: "h1" }];
    const diff = diffSectionHashes(prev, curr);
    expect(diff.changedSlugs).toEqual([]);
    expect(diff.newSlugs).toEqual([]);
  });
});

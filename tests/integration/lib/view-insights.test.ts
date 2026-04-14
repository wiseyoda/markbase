// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { advanceFileView } from "@/lib/change-digest";
import { computeViewInsights } from "@/lib/view-insights";
import { useTestDatabase } from "../../helpers/postgres";

interface FakeCommit {
  sha: string;
  content: string;
  date: string;
  login: string;
  message: string;
}

function setupFakeGithub(commits: FakeCommit[]) {
  const newestFirst = [...commits].reverse();
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url.toString();

    if (u.includes("/commits?")) {
      return {
        ok: true,
        json: async () =>
          newestFirst.map((c) => ({
            sha: c.sha,
            commit: { message: c.message, author: { date: c.date } },
            author: {
              login: c.login,
              avatar_url: `https://example.com/${c.login}.png`,
            },
          })),
      } as unknown as Response;
    }

    if (u.includes("/contents/")) {
      const refMatch = u.match(/ref=([^&]+)/);
      const ref = refMatch?.[1] ?? "";
      const commit = commits.find((c) => c.sha === ref);
      if (!commit) {
        return { ok: false, status: 404, text: async () => "" } as unknown as Response;
      }
      return { ok: true, text: async () => commit.content } as unknown as Response;
    }

    return { ok: false, status: 404 } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PARENT = `# Overview
Original paragraph that is unchanged.

## Setup
Unchanged section body.

## Known issues
- First issue
`;

const CURRENT = `# Overview
Original paragraph that is unchanged.

## Setup
Unchanged section body.

## Known issues
- First issue
- Second issue (new)

## FAQ
Brand new section body.
`;

describe("computeViewInsights", () => {
  useTestDatabase();

  beforeEach(async () => {
    await getDb()`TRUNCATE TABLE file_views, file_section_hashes RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function baseParams() {
    return {
      accessToken: "t",
      userId: "u1",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "docs/a.md",
      currentContent: CURRENT,
      currentRawContent: CURRENT,
      currentBlobSha: "blob-current",
    };
  }

  it("returns empty insights when userId is null", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    const result = await computeViewInsights({
      ...baseParams(),
      userId: null,
    });
    expect(result.currentCommitSha).toBeNull();
    expect(result.previousCommitSha).toBeNull();
    expect(result.changedSectionSlugs.size).toBe(0);
    expect(result.newSectionSlugs.size).toBe(0);
    expect(result.textChangedLines.size).toBe(0);
  });

  it("returns empty insights when history is empty", async () => {
    setupFakeGithub([]);
    const result = await computeViewInsights(baseParams());
    expect(result.currentCommitSha).toBeNull();
  });

  it("first view: diffs against parent commit and returns previousCommitSha=null", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    const result = await computeViewInsights(baseParams());
    expect(result.currentCommitSha).toBe("c1");
    expect(result.previousCommitSha).toBeNull();
    expect(result.changedSectionSlugs.size).toBeGreaterThan(0);
    expect(result.newSectionSlugs.has("faq")).toBe(true);
    expect(result.textChangedLines.size).toBeGreaterThan(0);
  });

  it("dismissed at current: returns empty diffs but preserves previousCommitSha", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    // Simulate user dismissing at the current commit.
    await advanceFileView({
      userId: "u1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "c1",
      blobSha: "blob-current",
    });

    const result = await computeViewInsights(baseParams());
    expect(result.currentCommitSha).toBe("c1");
    expect(result.previousCommitSha).toBe("c1");
    expect(result.changedSectionSlugs.size).toBe(0);
    expect(result.newSectionSlugs.size).toBe(0);
    expect(result.textChangedLines.size).toBe(0);
  });

  it("dismissed at older commit: diffs against the acknowledged baseline", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    await advanceFileView({
      userId: "u1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "c0",
      blobSha: "blob-parent",
    });

    const result = await computeViewInsights(baseParams());
    expect(result.currentCommitSha).toBe("c1");
    expect(result.previousCommitSha).toBe("c0");
    expect(result.newSectionSlugs.has("faq")).toBe(true);
    expect(result.textChangedLines.size).toBeGreaterThan(0);
  });

  it("refreshes are idempotent — baseline does not advance on a read", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    const r1 = await computeViewInsights(baseParams());
    const r2 = await computeViewInsights(baseParams());
    const r3 = await computeViewInsights(baseParams());
    expect(r1.previousCommitSha).toBeNull();
    expect(r2.previousCommitSha).toBeNull();
    expect(r3.previousCommitSha).toBeNull();
    expect(r1.newSectionSlugs.size).toBe(r2.newSectionSlugs.size);
    expect(r2.newSectionSlugs.size).toBe(r3.newSectionSlugs.size);

    const rows = await getDb()`SELECT * FROM file_views WHERE user_id='u1'`;
    expect(rows.length).toBe(0); // Never wrote because never dismissed
  });

  it("returns empty diffs when parent content fetch fails", async () => {
    // Only the latest commit is reachable — parent fetch returns 404.
    setupFakeGithub([
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "only commit" },
    ]);

    const result = await computeViewInsights(baseParams());
    // With only one commit, resolveDiffSource returns null → empty.
    expect(result.currentCommitSha).toBe("c1");
    expect(result.changedSectionSlugs.size).toBe(0);
    expect(result.textChangedLines.size).toBe(0);
  });

  it("returns empty insights when getFileHistory throws (catches top-level errors)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await computeViewInsights(baseParams());
    expect(result.currentCommitSha).toBeNull();
    expect(result.changedSectionSlugs.size).toBe(0);
  });

  it("returns previous-preserving empty when the baseline content fetch fails mid-flight", async () => {
    // History returns both commits, but only the current commit has content —
    // the parent (diff source) returns 404 from contents.
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/commits?")) {
        return {
          ok: true,
          json: async () => [
            {
              sha: "c1",
              commit: { message: "edit", author: { date: "2026-03-02T00:00:00Z" } },
              author: { login: "alice", avatar_url: "" },
            },
            {
              sha: "c0",
              commit: { message: "init", author: { date: "2026-03-01T00:00:00Z" } },
              author: { login: "alice", avatar_url: "" },
            },
          ],
        } as unknown as Response;
      }
      if (u.includes("/contents/") && u.includes("ref=c1")) {
        return { ok: true, text: async () => CURRENT } as unknown as Response;
      }
      // Parent content fetch fails
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await computeViewInsights(baseParams());
    expect(result.currentCommitSha).toBe("c1");
    expect(result.changedSectionSlugs.size).toBe(0);
    expect(result.textChangedLines.size).toBe(0);
  });

  it("handles baseline content with malformed frontmatter", async () => {
    const brokenFrontmatter = `---\ntitle: broken\nfoo\n---\n# Hi`;
    setupFakeGithub([
      { sha: "c0", content: brokenFrontmatter, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    const result = await computeViewInsights(baseParams());
    // Diff still computes against the raw baseline — stripFrontmatter falls
    // back to the unmodified content when gray-matter throws.
    expect(result.currentCommitSha).toBe("c1");
    expect(result.textChangedLines.size).toBeGreaterThan(0);
  });

  it("uses stored section hashes for the baseline blob when available", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    // User dismissed at c0 — store the matching baseline blob hashes so the
    // hot path uses them instead of re-extracting.
    await advanceFileView({
      userId: "u1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "c0",
      blobSha: "blob-parent",
    });
    const { storeSectionHashes } = await import("@/lib/section-hashes");
    await storeSectionHashes({
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      blobSha: "blob-parent",
      content: PARENT,
    });

    const result = await computeViewInsights(baseParams());
    expect(result.newSectionSlugs.has("faq")).toBe(true);
  });

  it("stores section hashes for the current blob (fire-and-forget)", async () => {
    setupFakeGithub([
      { sha: "c0", content: PARENT, date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", content: CURRENT, date: "2026-03-02T00:00:00Z", login: "alice", message: "edit" },
    ]);

    await computeViewInsights(baseParams());
    // Give the detached void call a microtask to flush.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const rows = await getDb()`
      SELECT section_slug FROM file_section_hashes
      WHERE owner='acme' AND repo='widgets' AND file_path='docs/a.md' AND blob_sha='blob-current'
    `;
    expect(rows.length).toBeGreaterThan(0);
  });
});

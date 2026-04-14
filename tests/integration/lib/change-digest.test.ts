// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { getDb } from "@/lib/db";
import { __setAiTestModel } from "@/lib/ai";
import {
  assembleChangeDigest,
  getOrCreateCommitSummary,
  recordFileView,
} from "@/lib/change-digest";
import { useTestDatabase } from "../../helpers/postgres";

function buildUsage(inputTotal: number, outputTotal: number) {
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputTotal,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: undefined,
    },
  };
}

function buildGenerateResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: buildUsage(50, 15),
    warnings: [],
  };
}

const promptCalls: Array<string | undefined> = [];

function sequencedMockModel(responses: string[]) {
  let i = 0;
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      const lastUserMessage = options.prompt
        .filter((m) => m.role === "user")
        .at(-1);
      const text = lastUserMessage
        ? lastUserMessage.content
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("")
        : "";
      promptCalls.push(text);
      const response = responses[Math.min(i, responses.length - 1)];
      i++;
      return buildGenerateResult(response);
    },
  });
}

interface FakeCommit {
  sha: string;
  parent: string | null;
  content: string;
  date: string;
  login: string;
  message: string;
}

interface FakeRepoState {
  commits: FakeCommit[];
}

function setupFakeGithub(state: FakeRepoState) {
  const commitsNewestFirst = () => [...state.commits].reverse();

  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url.toString();

    if (u.includes("/commits?")) {
      const list = commitsNewestFirst();
      const payload = list.map((c) => ({
        sha: c.sha,
        commit: {
          message: c.message,
          author: { date: c.date },
        },
        author: {
          login: c.login,
          avatar_url: `https://example.com/${c.login}.png`,
        },
      }));
      return {
        ok: true,
        json: async () => payload,
      } as unknown as Response;
    }

    if (u.includes("/contents/")) {
      const refMatch = u.match(/ref=([^&]+)/);
      const ref = refMatch?.[1] ?? "";
      const commit = state.commits.find((c) => c.sha === ref);
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

describe("recordFileView", () => {
  useTestDatabase();

  beforeEach(async () => {
    await getDb()`TRUNCATE TABLE file_views RESTART IDENTITY CASCADE`;
  });

  it("returns nulls on first view and stores both shas", async () => {
    const result = await recordFileView({
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "abc123",
      blobSha: "blob-1",
    });
    expect(result.previousCommitSha).toBeNull();
    expect(result.previousBlobSha).toBeNull();
    expect(result.currentCommitSha).toBe("abc123");
    expect(result.currentBlobSha).toBe("blob-1");

    const rows = await getDb()`
      SELECT last_viewed_sha, last_viewed_blob_sha FROM file_views
      WHERE user_id='user-1' AND owner='acme' AND repo='widgets' AND file_path='docs/a.md'
    `;
    expect(rows[0].last_viewed_sha).toBe("abc123");
    expect(rows[0].last_viewed_blob_sha).toBe("blob-1");
  });

  it("returns the previous shas and updates to the new ones", async () => {
    await recordFileView({
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "abc123",
      blobSha: "blob-1",
    });
    const second = await recordFileView({
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "def456",
      blobSha: "blob-2",
    });
    expect(second.previousCommitSha).toBe("abc123");
    expect(second.previousBlobSha).toBe("blob-1");
    expect(second.currentCommitSha).toBe("def456");
    expect(second.currentBlobSha).toBe("blob-2");
  });

  it("is isolated per user", async () => {
    await recordFileView({
      userId: "alice",
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      commitSha: "aaa",
      blobSha: "blob-a",
    });
    const bob = await recordFileView({
      userId: "bob",
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      commitSha: "bbb",
      blobSha: "blob-b",
    });
    expect(bob.previousCommitSha).toBeNull();
    expect(bob.previousBlobSha).toBeNull();
  });
});

describe("getOrCreateCommitSummary", () => {
  useTestDatabase();

  beforeEach(async () => {
    promptCalls.length = 0;
    process.env.OPENAI_API_KEY = "test-key";
    await getDb()`TRUNCATE TABLE file_commit_summaries RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setAiTestModel(null);
    delete process.env.OPENAI_API_KEY;
  });

  it("generates and caches a commit summary", async () => {
    setupFakeGithub({
      commits: [
        {
          sha: "p0",
          parent: null,
          content: "# Intro\nOriginal text",
          date: "2026-03-01T00:00:00Z",
          login: "alice",
          message: "init",
        },
        {
          sha: "c1",
          parent: "p0",
          content: "# Intro\nOriginal text\n\n## New section\nAdded details",
          date: "2026-03-02T00:00:00Z",
          login: "alice",
          message: "add section",
        },
      ],
    });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel(["Added a new section with details."]),
    });

    const first = await getOrCreateCommitSummary({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "c1",
      parentSha: "p0",
    });
    expect(first).toBe("Added a new section with details.");

    const callsBefore = promptCalls.length;
    const second = await getOrCreateCommitSummary({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "c1",
      parentSha: "p0",
    });
    expect(second).toBe("Added a new section with details.");
    expect(promptCalls.length).toBe(callsBefore);
  });

  it("backs off on a recent failure", async () => {
    setupFakeGithub({
      commits: [
        {
          sha: "p0",
          parent: null,
          content: "# doc",
          date: "2026-03-01T00:00:00Z",
          login: "alice",
          message: "init",
        },
        {
          sha: "c1",
          parent: "p0",
          content: "# doc updated",
          date: "2026-03-02T00:00:00Z",
          login: "alice",
          message: "edit",
        },
      ],
    });

    // Seed a failure row directly.
    await getDb()`
      INSERT INTO file_commit_summaries (
        owner, repo, file_path, commit_sha, parent_sha, failed_at, failure_reason
      )
      VALUES ('acme','widgets','a.md','c1','p0', NOW() - INTERVAL '2 minutes', 'prior failure')
    `;

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel(["should not be called"]),
    });

    const result = await getOrCreateCommitSummary({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      filePath: "a.md",
      commitSha: "c1",
      parentSha: "p0",
    });
    expect(result).toBeNull();
    expect(promptCalls.length).toBe(0);
  });

  it("records a failure when the model returns empty text", async () => {
    setupFakeGithub({
      commits: [
        {
          sha: "p0",
          parent: null,
          content: "# doc",
          date: "2026-03-01T00:00:00Z",
          login: "alice",
          message: "init",
        },
        {
          sha: "c1",
          parent: "p0",
          content: "# doc edit",
          date: "2026-03-02T00:00:00Z",
          login: "alice",
          message: "edit",
        },
      ],
    });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel([""]),
    });

    const result = await getOrCreateCommitSummary({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      filePath: "empty.md",
      commitSha: "c1",
      parentSha: "p0",
    });
    expect(result).toBeNull();

    const rows = await getDb()`
      SELECT failure_reason FROM file_commit_summaries WHERE file_path='empty.md'
    `;
    expect(rows[0].failure_reason).toMatch(/empty/);
  });

  it("records a failure row when content fetch returns null", async () => {
    setupFakeGithub({ commits: [] });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel(["should not be called"]),
    });

    const result = await getOrCreateCommitSummary({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      filePath: "missing.md",
      commitSha: "dead",
      parentSha: null,
    });
    expect(result).toBeNull();

    const rows = await getDb()`
      SELECT failed_at, failure_reason FROM file_commit_summaries
      WHERE commit_sha = 'dead'
    `;
    expect(rows[0].failed_at).not.toBeNull();
  });
});

describe("assembleChangeDigest", () => {
  useTestDatabase();

  beforeEach(async () => {
    promptCalls.length = 0;
    process.env.OPENAI_API_KEY = "test-key";
    await getDb()`TRUNCATE TABLE file_commit_summaries RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setAiTestModel(null);
    delete process.env.OPENAI_API_KEY;
  });

  it("returns null when from === to", async () => {
    setupFakeGithub({ commits: [] });
    const result = await assembleChangeDigest({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "a.md",
      fromCommitSha: "same",
      toCommitSha: "same",
    });
    expect(result).toBeNull();
  });

  it("returns a first-view digest when fromCommitSha is null", async () => {
    setupFakeGithub({
      commits: [
        { sha: "c0", parent: null, content: "# Hi", date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
        { sha: "c1", parent: "c0", content: "# Hi\n## A", date: "2026-03-02T00:00:00Z", login: "alice", message: "add A" },
        { sha: "c2", parent: "c1", content: "# Hi\n## A\n## B", date: "2026-03-03T00:00:00Z", login: "bob", message: "add B" },
        { sha: "c3", parent: "c2", content: "# Hi\n## A\n## B\n## C", date: "2026-03-04T00:00:00Z", login: "bob", message: "add C" },
      ],
    });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel([
        "Added section C.",
        "Added section B.",
        "Added section A.",
      ]),
    });

    const digest = await assembleChangeDigest({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "docs/a.md",
      fromCommitSha: null,
      toCommitSha: "c3",
    });

    expect(digest).not.toBeNull();
    expect(digest?.isFirstView).toBe(true);
    expect(digest?.fromSha).toBeNull();
    // First-view shows the latest 3 commits by default.
    expect(digest?.bullets).toHaveLength(3);
    expect(digest?.approximate).toBe(false);
  });

  it("returns bullets only when ≤3 new commits", async () => {
    setupFakeGithub({
      commits: [
        { sha: "c0", parent: null, content: "# Hi", date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
        { sha: "c1", parent: "c0", content: "# Hi\n\n## A", date: "2026-03-02T00:00:00Z", login: "alice", message: "add A" },
        { sha: "c2", parent: "c1", content: "# Hi\n\n## A\n\n## B", date: "2026-03-03T00:00:00Z", login: "bob", message: "add B" },
      ],
    });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel(["Added section B.", "Added section A."]),
    });

    const digest = await assembleChangeDigest({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "docs/a.md",
      fromCommitSha: "c0",
      toCommitSha: "c2",
    });

    expect(digest).not.toBeNull();
    expect(digest?.fromSha).toBe("c0");
    expect(digest?.toSha).toBe("c2");
    expect(digest?.bullets).toHaveLength(2);
    expect(digest?.synthesis).toBeNull();
    expect(digest?.approximate).toBe(false);
    const summaries = digest?.bullets.map((b) => b.summary).sort();
    expect(summaries).toEqual(["Added section A.", "Added section B."]);
  });

  it("synthesizes a paragraph when >3 new commits", async () => {
    const commits = [
      { sha: "c0", parent: null, content: "# v0", date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
      { sha: "c1", parent: "c0", content: "# v1", date: "2026-03-02T00:00:00Z", login: "alice", message: "v1" },
      { sha: "c2", parent: "c1", content: "# v2", date: "2026-03-03T00:00:00Z", login: "alice", message: "v2" },
      { sha: "c3", parent: "c2", content: "# v3", date: "2026-03-04T00:00:00Z", login: "alice", message: "v3" },
      { sha: "c4", parent: "c3", content: "# v4", date: "2026-03-05T00:00:00Z", login: "bob", message: "v4" },
    ];
    setupFakeGithub({ commits });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel([
        "Version bump 4.",
        "Version bump 3.",
        "Version bump 2.",
        "Version bump 1.",
        "Four iterative version bumps with minor changes throughout.",
      ]),
    });

    const digest = await assembleChangeDigest({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "docs/a.md",
      fromCommitSha: "c0",
      toCommitSha: "c4",
    });

    expect(digest).not.toBeNull();
    expect(digest?.bullets).toHaveLength(4);
    expect(digest?.synthesis).toBe(
      "Four iterative version bumps with minor changes throughout.",
    );
  });

  it("marks the digest approximate when from sha is outside history", async () => {
    setupFakeGithub({
      commits: [
        { sha: "c0", parent: null, content: "# Hi", date: "2026-03-01T00:00:00Z", login: "alice", message: "init" },
        { sha: "c1", parent: "c0", content: "# Hi\n## A", date: "2026-03-02T00:00:00Z", login: "alice", message: "add A" },
      ],
    });

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: sequencedMockModel(["Added section A.", "Initial content."]),
    });

    const digest = await assembleChangeDigest({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "docs/a.md",
      fromCommitSha: "ancient-sha-not-in-history",
      toCommitSha: "c1",
    });

    expect(digest?.approximate).toBe(true);
    expect(digest?.bullets.length).toBeGreaterThan(0);
  });

  it("returns null when ai is disabled", async () => {
    delete process.env.OPENAI_API_KEY;
    const digest = await assembleChangeDigest({
      accessToken: "t",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "a.md",
      fromCommitSha: "c0",
      toCommitSha: "c1",
    });
    expect(digest).toBeNull();
  });
});

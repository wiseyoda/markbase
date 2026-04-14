// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { getDb } from "@/lib/db";
import { __setAiTestModel } from "@/lib/ai";
import {
  computeBlobSha,
  getFileSummary,
  getOrCreateFileSummary,
} from "@/lib/file-summaries";
import { useTestDatabase } from "../../helpers/postgres";

const LONG_DOC = `# Release notes

This document covers the upcoming release of the platform, including API
changes, migrations, and deprecations. It is aimed at integrators and
internal developers who need to update their clients.

## Breaking changes
- Field renames across the v2 API
- Deprecation of the legacy auth flow
- New rate limiting headers

## Migration checklist
Run the migration script after the deploy window.`;

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

function buildGenerateResult(text: string, inputTokens = 80, outputTokens = 20) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: buildUsage(inputTokens, outputTokens),
    warnings: [],
  };
}

function mockModel(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => buildGenerateResult(text),
  });
}

function throwingModel(message: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error(message);
    },
  });
}

describe("computeBlobSha", () => {
  it("matches the git blob sha format", () => {
    // Git's blob sha for an empty file is hardcoded at e69de29b...
    expect(computeBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  it("produces stable output for the same content", () => {
    const a = computeBlobSha("hello world");
    const b = computeBlobSha("hello world");
    expect(a).toBe(b);
  });

  it("produces different shas for different content", () => {
    expect(computeBlobSha("one")).not.toBe(computeBlobSha("two"));
  });

  it("is byte-length sensitive (utf8)", () => {
    const ascii = computeBlobSha("abc");
    const emoji = computeBlobSha("a🙂c");
    expect(ascii).not.toBe(emoji);
  });
});

describe("file summaries", () => {
  useTestDatabase();

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = "test-key";
    await getDb()`TRUNCATE TABLE file_summaries RESTART IDENTITY CASCADE`;
  });

  afterEach(() => {
    __setAiTestModel(null);
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SUMMARIES_ENABLED;
  });

  it("getFileSummary returns null on cache miss", async () => {
    const result = await getFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "README.md",
      blobSha: "deadbeef",
    });
    expect(result).toBeNull();
  });

  it("generates and stores a summary, then serves it from cache", async () => {
    __setAiTestModel({
      provider: "openai",
      model: "mock-model",
      instance: mockModel("A concise release note."),
    });

    const blobSha = computeBlobSha(LONG_DOC);
    const first = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "NOTES.md",
      blobSha,
      content: LONG_DOC,
    });

    expect(first).not.toBeNull();
    expect(first?.summary).toBe("A concise release note.");
    expect(first?.provider).toBe("openai");
    expect(first?.model).toBe("mock-model");

    // Swap to a model that would throw if called again; cache hit should
    // avoid generation entirely.
    __setAiTestModel({
      provider: "openai",
      model: "should-not-be-called",
      instance: throwingModel("generator should not be invoked on cache hit"),
    });

    const cached = await getFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "NOTES.md",
      blobSha,
    });
    expect(cached?.summary).toBe("A concise release note.");

    const secondGet = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "NOTES.md",
      blobSha,
      content: LONG_DOC,
    });
    expect(secondGet?.summary).toBe("A concise release note.");

    const rows = await getDb()`
      SELECT summary, input_tokens, output_tokens
      FROM file_summaries
      WHERE owner='acme' AND repo='widgets' AND file_path='NOTES.md' AND blob_sha=${blobSha}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].input_tokens).toBe(80);
    expect(rows[0].output_tokens).toBe(20);
  });

  it("skips trivial files below the minimum content length", async () => {
    const content = "# hi";
    const blobSha = computeBlobSha(content);
    const result = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "tiny.md",
      blobSha,
      content,
    });
    expect(result).toBeNull();

    const rows = await getDb()`
      SELECT 1 FROM file_summaries WHERE blob_sha = ${blobSha}
    `;
    expect(rows.length).toBe(0);
  });

  it("strips frontmatter before checking the minimum length", async () => {
    const content = `---\ntitle: Trivial\nauthor: alice\n---\n# hi`;
    const blobSha = computeBlobSha(content);
    const result = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "frontmatter.md",
      blobSha,
      content,
    });
    expect(result).toBeNull();
  });

  it("returns null when AI is disabled even for large content", async () => {
    delete process.env.OPENAI_API_KEY;
    const blobSha = computeBlobSha(LONG_DOC);
    const result = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "disabled.md",
      blobSha,
      content: LONG_DOC,
    });
    expect(result).toBeNull();
  });

  it("records a failure row and backs off on subsequent retries", async () => {
    __setAiTestModel({
      provider: "openai",
      model: "mock-model",
      instance: throwingModel("rate limited"),
    });

    const blobSha = computeBlobSha(LONG_DOC);
    const first = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "broken.md",
      blobSha,
      content: LONG_DOC,
    });
    expect(first).toBeNull();

    const rows = await getDb()`
      SELECT failed_at, failure_reason, summary
      FROM file_summaries
      WHERE owner='acme' AND repo='widgets' AND file_path='broken.md' AND blob_sha=${blobSha}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].summary).toBeNull();
    expect(rows[0].failed_at).not.toBeNull();
    expect(rows[0].failure_reason).toBeTruthy();

    // A subsequent attempt inside the backoff window should return null
    // without calling the model. Swap to a mock that would succeed to prove
    // it isn't being called.
    __setAiTestModel({
      provider: "openai",
      model: "success-mock",
      instance: mockModel("new summary"),
    });
    const second = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "broken.md",
      blobSha,
      content: LONG_DOC,
    });
    expect(second).toBeNull();
  });

  it("recovers from a failure after the backoff window elapses", async () => {
    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: throwingModel("boom"),
    });

    const blobSha = computeBlobSha(LONG_DOC);
    await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "recover.md",
      blobSha,
      content: LONG_DOC,
    });

    // Simulate backoff expiry by manually rewinding failed_at.
    await getDb()`
      UPDATE file_summaries
      SET failed_at = NOW() - INTERVAL '2 hours'
      WHERE file_path = 'recover.md'
    `;

    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: mockModel("Recovered summary"),
    });

    const retry = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "recover.md",
      blobSha,
      content: LONG_DOC,
    });

    expect(retry?.summary).toBe("Recovered summary");

    const rows = await getDb()`
      SELECT summary, failed_at FROM file_summaries WHERE file_path='recover.md'
    `;
    expect(rows[0].summary).toBe("Recovered summary");
    expect(rows[0].failed_at).toBeNull();
  });

  it("records an empty-generation failure when the model returns null", async () => {
    __setAiTestModel({
      provider: "openai",
      model: "mock",
      instance: new MockLanguageModelV3({
        doGenerate: async () => buildGenerateResult("", 10, 0),
      }),
    });

    const blobSha = computeBlobSha(LONG_DOC);
    const result = await getOrCreateFileSummary({
      owner: "acme",
      repo: "widgets",
      filePath: "empty.md",
      blobSha,
      content: LONG_DOC,
    });
    expect(result).toBeNull();

    const rows = await getDb()`
      SELECT failed_at, failure_reason FROM file_summaries WHERE file_path='empty.md'
    `;
    expect(rows[0].failed_at).not.toBeNull();
    expect(rows[0].failure_reason).toMatch(/empty/);
  });
});

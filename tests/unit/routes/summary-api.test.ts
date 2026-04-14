// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getShareMock = vi.fn();
const getFileContentMock = vi.fn();
const getDefaultBranchMock = vi.fn();
const withDbRetryMock = vi.fn((fn: () => Promise<unknown>) => fn());
const getAiStatusMock = vi.fn();
const getOrCreateFileSummaryMock = vi.fn();
const computeBlobShaMock = vi.fn(() => "blob-sha-abc");

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/github", () => ({
  getFileContent: getFileContentMock,
  getDefaultBranch: getDefaultBranchMock,
}));
vi.mock("@/lib/shares", () => ({ getShare: getShareMock }));
vi.mock("@/lib/db", () => ({ withDbRetry: withDbRetryMock }));
vi.mock("@/lib/ai", () => ({ getAiStatus: getAiStatusMock }));
vi.mock("@/lib/file-summaries", () => ({
  getOrCreateFileSummary: getOrCreateFileSummaryMock,
  computeBlobSha: computeBlobShaMock,
}));

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as import("next/server").NextRequest;
}

describe("GET /api/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiStatusMock.mockReturnValue({ enabled: true, provider: "openai", model: "mock" });
  });

  it("returns 400 when required query params are missing", async () => {
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(request("http://localhost/api/summary?owner=a"));
    expect(res.status).toBe(400);
  });

  it("returns enabled=false when AI is disabled", async () => {
    getAiStatusMock.mockReturnValue({ enabled: false, provider: null, model: null, reason: "no keys" });
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=x.md"),
    );
    const body = await res.json();
    expect(body).toEqual({ enabled: false, summary: null, reason: "no keys" });
  });

  it("returns 401 without shareId and without a session", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=x.md"),
    );
    expect(res.status).toBe(401);
  });

  it("generates a summary for authenticated users", async () => {
    authMock.mockResolvedValue({ accessToken: "tok", user: { id: "u1" } });
    getDefaultBranchMock.mockResolvedValue("main");
    getFileContentMock.mockResolvedValue("# doc\nbody".repeat(50));
    getOrCreateFileSummaryMock.mockResolvedValue({
      summary: "A short summary.",
      provider: "openai",
      model: "mock",
      createdAt: new Date("2026-04-14T00:00:00Z"),
    });

    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=acme&repo=widgets&path=README.md"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.summary.text).toBe("A short summary.");
    expect(body.summary.provider).toBe("openai");
    expect(getOrCreateFileSummaryMock).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      filePath: "README.md",
      blobSha: "blob-sha-abc",
      content: expect.any(String),
    });
  });

  it("returns null summary when generation fails", async () => {
    authMock.mockResolvedValue({ accessToken: "tok" });
    getDefaultBranchMock.mockResolvedValue("main");
    getFileContentMock.mockResolvedValue("short");
    getOrCreateFileSummaryMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=x.md"),
    );
    const body = await res.json();
    expect(body.summary).toBeNull();
    expect(body.reason).toBeTruthy();
  });

  it("returns 404 when the file content cannot be fetched", async () => {
    authMock.mockResolvedValue({ accessToken: "tok" });
    getDefaultBranchMock.mockResolvedValue("main");
    getFileContentMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=gone.md"),
    );
    expect(res.status).toBe(404);
  });

  it("validates share access for share-scoped lookups", async () => {
    getShareMock.mockResolvedValue({
      repo: "acme/widgets",
      type: "file",
      file_path: "docs/a.md",
      branch: "main",
      accessToken: "share-tok",
      shared_with: null,
    });
    getFileContentMock.mockResolvedValue("long content".repeat(40));
    getOrCreateFileSummaryMock.mockResolvedValue({
      summary: "ok",
      provider: "openai",
      model: "mock",
      createdAt: new Date(),
    });
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request(
        "http://localhost/api/summary?owner=acme&repo=widgets&path=docs/a.md&shareId=sh1",
      ),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when share does not exist", async () => {
    getShareMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=x.md&shareId=bad"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when share repo does not match params", async () => {
    getShareMock.mockResolvedValue({
      repo: "other/repo",
      type: "file",
      file_path: "a.md",
      branch: "main",
      accessToken: "tok",
      shared_with: null,
    });
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=a.md&shareId=sh"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when file-share path does not match", async () => {
    getShareMock.mockResolvedValue({
      repo: "a/b",
      type: "file",
      file_path: "original.md",
      branch: "main",
      accessToken: "tok",
      shared_with: null,
    });
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=different.md&shareId=sh"),
    );
    expect(res.status).toBe(403);
  });

  it("enforces folder-share scope", async () => {
    getShareMock.mockResolvedValue({
      repo: "a/b",
      type: "folder",
      file_path: "docs",
      branch: "main",
      accessToken: "tok",
      shared_with: null,
    });
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=unrelated.md&shareId=sh"),
    );
    expect(res.status).toBe(403);
  });

  it("enforces user-targeted share auth", async () => {
    getShareMock.mockResolvedValue({
      repo: "a/b",
      type: "file",
      file_path: "a.md",
      branch: "main",
      accessToken: "tok",
      shared_with: "only-me",
    });
    authMock.mockResolvedValue({ user: { id: "someone-else" } });
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(
      request("http://localhost/api/summary?owner=a&repo=b&path=a.md&shareId=sh"),
    );
    expect(res.status).toBe(401);
  });
});

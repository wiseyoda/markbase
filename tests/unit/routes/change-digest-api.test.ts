// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getDefaultBranchMock = vi.fn();
const getRepositoryMetadataMock = vi.fn();
const assembleChangeDigestMock = vi.fn();
const getAiStatusMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/github", () => ({
  getDefaultBranch: getDefaultBranchMock,
  getRepositoryMetadata: getRepositoryMetadataMock,
}));
vi.mock("@/lib/change-digest", () => ({
  assembleChangeDigest: assembleChangeDigestMock,
}));
vi.mock("@/lib/ai", () => ({
  getAiStatus: getAiStatusMock,
}));

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as import("next/server").NextRequest;
}

describe("GET /api/change-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_PRIVATE_REPO_SUMMARIES_ENABLED;
    getAiStatusMock.mockReturnValue({ enabled: true, provider: "openai", model: "m" });
    getRepositoryMetadataMock.mockResolvedValue({ defaultBranch: "main", private: false });
  });

  it("does not send private repository content to the AI provider without opt-in", async () => {
    authMock.mockResolvedValue({ accessToken: "tok" });
    getRepositoryMetadataMock.mockResolvedValue({ defaultBranch: "main", private: true });
    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request("http://localhost/api/change-digest?owner=acme&repo=secret&path=a.md&to=t"),
    );
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.digest).toBeNull();
    expect(assembleChangeDigestMock).not.toHaveBeenCalled();

    process.env.AI_PRIVATE_REPO_SUMMARIES_ENABLED = "true";
    getDefaultBranchMock.mockResolvedValue("main");
    assembleChangeDigestMock.mockResolvedValue(null);
    const optedIn = await GET(
      request("http://localhost/api/change-digest?owner=acme&repo=secret&path=a.md&to=t"),
    );
    expect((await optedIn.json()).enabled).toBe(true);
    expect(assembleChangeDigestMock).toHaveBeenCalled();
  });

  it("returns 400 when required query params are missing", async () => {
    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request("http://localhost/api/change-digest?owner=a&repo=b&path=x.md"),
    );
    expect(res.status).toBe(400);
  });

  it("returns enabled=false when ai is disabled", async () => {
    getAiStatusMock.mockReturnValue({
      enabled: false,
      provider: null,
      model: null,
      reason: "off",
    });
    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request(
        "http://localhost/api/change-digest?owner=a&repo=b&path=x.md&from=f&to=t",
      ),
    );
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.digest).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request(
        "http://localhost/api/change-digest?owner=a&repo=b&path=x.md&from=f&to=t",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("fails closed when repository metadata cannot be fetched", async () => {
    authMock.mockResolvedValue({ accessToken: "tok" });
    getRepositoryMetadataMock.mockRejectedValue(new Error("github down"));
    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request("http://localhost/api/change-digest?owner=acme&repo=widgets&path=a.md&to=t"),
    );
    expect((await res.json()).enabled).toBe(false);
    expect(assembleChangeDigestMock).not.toHaveBeenCalled();
  });

  it("returns the assembled digest for an authenticated user", async () => {
    authMock.mockResolvedValue({ accessToken: "tok" });
    getDefaultBranchMock.mockResolvedValue("main");
    const digest = {
      fromSha: "f",
      toSha: "t",
      bullets: [
        {
          sha: "c1",
          shortSha: "c1",
          summary: "did a thing",
          date: "2026-04-14T00:00:00Z",
          author: { login: "alice", avatarUrl: "" },
          messageFirstLine: "commit",
        },
      ],
      synthesis: null,
      approximate: false,
    };
    assembleChangeDigestMock.mockResolvedValue(digest);

    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request(
        "http://localhost/api/change-digest?owner=acme&repo=widgets&path=a.md&from=f&to=t",
      ),
    );
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.digest).toEqual(digest);
    expect(assembleChangeDigestMock).toHaveBeenCalledWith({
      accessToken: "tok",
      owner: "acme",
      repo: "widgets",
      branch: "main",
      filePath: "a.md",
      fromCommitSha: "f",
      toCommitSha: "t",
    });
  });

  it("returns null digest when assembleChangeDigest yields nothing", async () => {
    authMock.mockResolvedValue({ accessToken: "tok" });
    getDefaultBranchMock.mockResolvedValue("main");
    assembleChangeDigestMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/change-digest/route");
    const res = await GET(
      request(
        "http://localhost/api/change-digest?owner=a&repo=b&path=a.md&from=f&to=t",
      ),
    );
    const body = await res.json();
    expect(body.digest).toBeNull();
  });
});

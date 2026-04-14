// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const advanceFileViewMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/change-digest", () => ({
  advanceFileView: advanceFileViewMock,
}));

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/file-view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function badJsonRequest() {
  return new Request("http://localhost/api/file-view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid",
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/file-view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/file-view/route");
    const res = await POST(
      jsonRequest({
        owner: "a",
        repo: "b",
        path: "a.md",
        commitSha: "c",
        blobSha: "bl",
      }),
    );
    expect(res.status).toBe(401);
    expect(advanceFileViewMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the JSON body is malformed", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("@/app/api/file-view/route");
    const res = await POST(badJsonRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("@/app/api/file-view/route");
    const res = await POST(
      jsonRequest({ owner: "a", repo: "b" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields have the wrong type", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("@/app/api/file-view/route");
    const res = await POST(
      jsonRequest({
        owner: "a",
        repo: "b",
        path: 123,
        commitSha: "c",
        blobSha: "bl",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("advances the file view baseline when valid", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    advanceFileViewMock.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/file-view/route");
    const res = await POST(
      jsonRequest({
        owner: "acme",
        repo: "widgets",
        path: "docs/a.md",
        commitSha: "abc123",
        blobSha: "blob-1",
      }),
    );
    expect(res.status).toBe(200);
    expect(advanceFileViewMock).toHaveBeenCalledWith({
      userId: "u1",
      owner: "acme",
      repo: "widgets",
      filePath: "docs/a.md",
      commitSha: "abc123",
      blobSha: "blob-1",
    });
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

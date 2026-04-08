// @vitest-environment node

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const expireGitHubBranchCacheMock = vi.fn();

vi.mock("@/lib/github-cache", () => ({
  expireGitHubBranchCache: expireGitHubBranchCacheMock,
}));

function signPayload(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

function makeRequest(
  payload: string,
  event: string,
  secret = "webhook-secret",
  includeSignature = true,
): NextRequest {
  const headers = new Headers({
    "x-github-event": event,
  });

  if (includeSignature) {
    headers.set("x-hub-signature-256", signPayload(payload, secret));
  }

  return new NextRequest("https://markbase.test/api/github/webhook", {
    method: "POST",
    body: payload,
    headers,
  });
}

describe("GitHub webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
  });

  it("returns 503 when the webhook secret is not configured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/github/webhook/route");

    const response = await POST(makeRequest("{}", "ping"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "GitHub webhook secret is not configured",
    });
  });

  it("rejects missing and invalid signatures", async () => {
    const { POST } = await import("@/app/api/github/webhook/route");

    const missingSignature = await POST(
      makeRequest("{}", "ping", "webhook-secret", false),
    );
    expect(missingSignature.status).toBe(401);
    expect(await missingSignature.json()).toEqual({
      error: "Missing GitHub webhook signature",
    });

    const invalidSignature = await POST(
      new NextRequest("https://markbase.test/api/github/webhook", {
        method: "POST",
        body: "{}",
        headers: {
          "x-github-event": "ping",
          "x-hub-signature-256": signPayload("{}", "wrong-secret"),
        },
      }),
    );
    expect(invalidSignature.status).toBe(401);
    expect(await invalidSignature.json()).toEqual({
      error: "Invalid GitHub webhook signature",
    });
  });

  it("handles ping events and unsupported event types", async () => {
    const { POST } = await import("@/app/api/github/webhook/route");

    const ping = await POST(makeRequest("{}", "ping"));
    expect(ping.status).toBe(200);
    expect(await ping.json()).toEqual({ ok: true });

    const unsupported = await POST(makeRequest("{}", "issues"));
    expect(unsupported.status).toBe(202);
    expect(await unsupported.json()).toEqual({
      ignored: true,
      reason: "Unsupported event",
    });
  });

  it("validates push payloads before invalidating cache", async () => {
    const { POST } = await import("@/app/api/github/webhook/route");

    const invalidJson = await POST(makeRequest("{", "push"));
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({
      error: "Invalid JSON payload",
    });

    const missingData = await POST(makeRequest(JSON.stringify({}), "push"));
    expect(missingData.status).toBe(400);
    expect(await missingData.json()).toEqual({
      error: "Missing repository or ref",
    });

    const nonBranchPush = await POST(
      makeRequest(
        JSON.stringify({
          ref: "refs/tags/v1.0.0",
          repository: { full_name: "owner/repo" },
        }),
        "push",
      ),
    );
    expect(nonBranchPush.status).toBe(202);
    expect(await nonBranchPush.json()).toEqual({
      ignored: true,
      reason: "Not a branch push",
    });

    const invalidRepo = await POST(
      makeRequest(
        JSON.stringify({
          ref: "refs/heads/main",
          repository: { full_name: "owner-only" },
        }),
        "push",
      ),
    );
    expect(invalidRepo.status).toBe(400);
    expect(await invalidRepo.json()).toEqual({
      error: "Invalid repository name",
    });
  });

  it("expires the pushed branch cache on valid push events", async () => {
    const { POST } = await import("@/app/api/github/webhook/route");

    const response = await POST(
      makeRequest(
        JSON.stringify({
          ref: "refs/heads/main",
          repository: { full_name: "owner/repo" },
        }),
        "push",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      repo: "owner/repo",
      branch: "main",
    });
    expect(expireGitHubBranchCacheMock).toHaveBeenCalledWith(
      "owner",
      "repo",
      "main",
    );
  });
});

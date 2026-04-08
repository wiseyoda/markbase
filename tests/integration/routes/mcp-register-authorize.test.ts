// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("MCP registration and authorization routes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GITHUB_ID = "test-github-id";
    process.env.NEXTAUTH_URL = "https://markbase.test";
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.GITHUB_WEB_BASE_URL = "https://github.test";
  });

  it("registers clients from redirect URIs", async () => {
    const { POST } = await import("@/app/api/mcp/register/route");
    const request = new NextRequest("https://markbase.test/api/mcp/register", {
      method: "POST",
      body: JSON.stringify({
        client_name: "My MCP Client",
        redirect_uris: ["https://example.com/callback"],
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body.client_name).toBe("My MCP Client");
    expect(body.redirect_uris).toEqual(["https://example.com/callback"]);
    expect(body.client_id).toHaveLength(16);
  });

  it("validates registration payloads", async () => {
    const { POST } = await import("@/app/api/mcp/register/route");
    const request = new NextRequest("https://markbase.test/api/mcp/register", {
      method: "POST",
      body: JSON.stringify({ redirect_uris: [] }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("uses the default client name when missing", async () => {
    const { POST } = await import("@/app/api/mcp/register/route");
    const request = new NextRequest("https://markbase.test/api/mcp/register", {
      method: "POST",
      body: JSON.stringify({
        redirect_uris: ["https://example.com/callback"],
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    expect((await response.json()).client_name).toBe("MCP Client");
  });

  it("redirects to GitHub authorization with an encoded state", async () => {
    const { GET } = await import("@/app/api/mcp/authorize/route");
    const request = new NextRequest(
      "https://markbase.test/api/mcp/authorize?response_type=code&redirect_uri=https://example.com/callback&client_id=client-1&state=client-state&code_challenge=challenge&code_challenge_method=S256",
    );

    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://github.test/login/oauth/authorize",
    );
  });

  it("fills empty client and state values when omitted", async () => {
    const { GET } = await import("@/app/api/mcp/authorize/route");
    const response = await GET(
      new NextRequest(
        "https://markbase.test/api/mcp/authorize?response_type=code&redirect_uri=https://example.com/callback&code_challenge=challenge&code_challenge_method=S256",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("state=");
  });

  it("uses the default callback base URL when NEXTAUTH_URL is unset", async () => {
    delete process.env.NEXTAUTH_URL;
    vi.resetModules();
    process.env.GITHUB_ID = "test-github-id";
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.GITHUB_WEB_BASE_URL = "https://github.test";

    const { GET } = await import("@/app/api/mcp/authorize/route");
    const response = await GET(
      new NextRequest(
        "https://markbase.test/api/mcp/authorize?response_type=code&redirect_uri=https://example.com/callback&code_challenge=challenge&code_challenge_method=S256",
      ),
    );

    expect(response.headers.get("location")).toContain(
      encodeURIComponent("https://markbase-github.vercel.app/api/mcp/callback"),
    );
  });

  it("validates authorization query params", async () => {
    const { GET } = await import("@/app/api/mcp/authorize/route");
    const invalidType = await GET(
      new NextRequest("https://markbase.test/api/mcp/authorize?response_type=token"),
    );
    expect((await invalidType.json()).error).toBe("invalid_request");

    const missingChallenge = await GET(
      new NextRequest(
        "https://markbase.test/api/mcp/authorize?response_type=code&redirect_uri=https://example.com/callback&code_challenge_method=S256",
      ),
    );
    expect(missingChallenge.status).toBe(400);

    const invalidMethod = await GET(
      new NextRequest(
        "https://markbase.test/api/mcp/authorize?response_type=code&redirect_uri=https://example.com/callback&code_challenge=challenge&code_challenge_method=plain",
      ),
    );
    expect(invalidMethod.status).toBe(400);

    const missingRedirect = await GET(
      new NextRequest(
        "https://markbase.test/api/mcp/authorize?response_type=code&code_challenge=challenge&code_challenge_method=S256",
      ),
    );
    expect(missingRedirect.status).toBe(400);
  });
});

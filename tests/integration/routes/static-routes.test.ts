// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  handlers: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

describe("static route handlers", () => {
  it("returns OAuth authorization server metadata", async () => {
    process.env.NEXTAUTH_URL = "https://markbase.test";
    vi.resetModules();
    const { GET } = await import("@/app/.well-known/oauth-authorization-server/route");

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({
      issuer: "https://markbase.test",
      authorization_endpoint: "https://markbase.test/api/mcp/authorize",
      token_endpoint: "https://markbase.test/api/mcp/token",
      registration_endpoint: "https://markbase.test/api/mcp/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["comments"],
    });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("returns OAuth protected resource metadata", async () => {
    process.env.NEXTAUTH_URL = "https://markbase.test";
    vi.resetModules();
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/route");

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({
      resource: "https://markbase.test/api/mcp",
      authorization_servers: ["https://markbase.test"],
      scopes_supported: ["comments"],
      bearer_methods_supported: ["header"],
    });
  });

  it("re-exports next-auth handlers", async () => {
    vi.resetModules();
    const { GET, POST } = await import("@/app/api/auth/[...nextauth]/route");

    expect(typeof GET).toBe("function");
    expect(typeof POST).toBe("function");
  });

  it("falls back to the default base URL when NEXTAUTH_URL is unset", async () => {
    delete process.env.NEXTAUTH_URL;
    vi.resetModules();

    const { GET: authorizationServer } = await import(
      "@/app/.well-known/oauth-authorization-server/route"
    );
    const { GET: protectedResource } = await import(
      "@/app/.well-known/oauth-protected-resource/route"
    );

    expect((await authorizationServer().json()).issuer).toBe(
      "https://markbase-github.vercel.app",
    );
    expect((await protectedResource().json()).resource).toBe(
      "https://markbase-github.vercel.app/api/mcp",
    );
  });
});

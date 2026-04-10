// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

describe("MCP JWT helpers", () => {
  afterEach(() => {
    delete process.env.SHARE_ENCRYPTION_KEY;
    vi.resetModules();
  });

  it("signs and verifies tokens", async () => {
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const { signMcpToken, verifyMcpToken } = await import("@/lib/mcp/jwt");

    const token = await signMcpToken({
      sub: "1",
      login: "owner-user",
      name: "Owner User",
      avatar_url: "https://example.com/owner.png",
      githubToken: "owner-token",
    });

    expect(token).not.toContain("owner-token");

    await expect(verifyMcpToken(token)).resolves.toEqual({
      sub: "1",
      login: "owner-user",
      name: "Owner User",
      avatar_url: "https://example.com/owner.png",
      github_token: "owner-token",
    });
  });

  it("rejects invalid signing keys", async () => {
    process.env.SHARE_ENCRYPTION_KEY = "short";
    const { signMcpToken } = await import("@/lib/mcp/jwt");

    await expect(
      signMcpToken({
        sub: "1",
        login: "owner-user",
        name: "Owner User",
        avatar_url: "https://example.com/owner.png",
        githubToken: "owner-token",
      }),
    ).rejects.toThrow("SHARE_ENCRYPTION_KEY must be a 64-char hex string");
  });

  it("rejects missing signing keys", async () => {
    const { signMcpToken } = await import("@/lib/mcp/jwt");

    await expect(
      signMcpToken({
        sub: "1",
        login: "owner-user",
        name: "Owner User",
        avatar_url: "https://example.com/owner.png",
        githubToken: "owner-token",
      }),
    ).rejects.toThrow("SHARE_ENCRYPTION_KEY must be a 64-char hex string");
  });

  it("signs and verifies refresh tokens", async () => {
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const { signMcpRefreshToken, verifyMcpRefreshToken } = await import(
      "@/lib/mcp/jwt"
    );

    const token = await signMcpRefreshToken({
      sub: "1",
      login: "owner-user",
      name: "Owner User",
      avatar_url: "https://example.com/owner.png",
      githubToken: "owner-token",
    });

    await expect(verifyMcpRefreshToken(token)).resolves.toEqual({
      sub: "1",
      login: "owner-user",
      name: "Owner User",
      avatar_url: "https://example.com/owner.png",
      github_token: "owner-token",
    });
  });

  it("rejects access tokens used as refresh tokens", async () => {
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const { signMcpToken, verifyMcpRefreshToken } = await import(
      "@/lib/mcp/jwt"
    );

    const accessToken = await signMcpToken({
      sub: "1",
      login: "owner-user",
      name: "Owner User",
      avatar_url: "https://example.com/owner.png",
      githubToken: "owner-token",
    });

    await expect(verifyMcpRefreshToken(accessToken)).rejects.toThrow();
  });
});

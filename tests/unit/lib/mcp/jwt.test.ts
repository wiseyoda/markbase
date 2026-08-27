// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

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
      grantId: "grant-1",
      tokenVersion: 1,
    });

    expect(token).not.toContain("owner-token");

    await expect(verifyMcpToken(token)).resolves.toEqual({
      sub: "1",
      grant_id: "grant-1",
      token_version: 1,
    });
  });

  it("rejects invalid signing keys", async () => {
    process.env.SHARE_ENCRYPTION_KEY = "short";
    const { signMcpToken } = await import("@/lib/mcp/jwt");

    await expect(
      signMcpToken({
        sub: "1",
        grantId: "grant-1",
        tokenVersion: 1,
      }),
    ).rejects.toThrow("SHARE_ENCRYPTION_KEY must be a 64-char hex string");
  });

  it("rejects missing signing keys", async () => {
    const { signMcpToken } = await import("@/lib/mcp/jwt");

    await expect(
      signMcpToken({
        sub: "1",
        grantId: "grant-1",
        tokenVersion: 1,
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
      grantId: "grant-1",
      tokenVersion: 1,
    });

    await expect(verifyMcpRefreshToken(token)).resolves.toEqual({
      sub: "1",
      grant_id: "grant-1",
      token_version: 1,
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
      grantId: "grant-1",
      tokenVersion: 1,
    });

    await expect(verifyMcpRefreshToken(accessToken)).rejects.toThrow();
  });

  it("rejects signed tokens with malformed grant payloads", async () => {
    const hex =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.SHARE_ENCRYPTION_KEY = hex;
    const { verifyMcpToken, verifyMcpRefreshToken } = await import(
      "@/lib/mcp/jwt"
    );
    const key = new Uint8Array(Buffer.from(hex, "hex"));
    const signInvalid = (audience: string) =>
      new SignJWT({ grant_id: 42, token_version: "one" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer("markbase")
        .setAudience(audience)
        .setSubject("1")
        .setExpirationTime("1h")
        .sign(key);

    await expect(verifyMcpToken(await signInvalid("mcp"))).rejects.toThrow(
      "Invalid MCP token payload",
    );
    await expect(
      verifyMcpRefreshToken(await signInvalid("mcp-refresh")),
    ).rejects.toThrow("Invalid MCP token payload");
  });
});

// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeAuthCode,
  decodeOAuthState,
  deriveClientId,
  encodeAuthCode,
  encodeOAuthState,
  verifyPkce,
} from "@/lib/mcp/oauth";

describe("MCP OAuth helpers", () => {
  afterEach(() => {
    delete process.env.SHARE_ENCRYPTION_KEY;
    vi.useRealTimers();
  });

  it("encodes and decodes OAuth state", () => {
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const encoded = encodeOAuthState({
      code_challenge: "challenge",
      code_challenge_method: "S256",
      redirect_uri: "https://example.com/callback",
      client_id: "client",
      client_state: "state",
    });

    expect(decodeOAuthState(encoded)).toEqual({
      code_challenge: "challenge",
      code_challenge_method: "S256",
      redirect_uri: "https://example.com/callback",
      client_id: "client",
      client_state: "state",
    });
  });

  it("rejects expired auth codes", () => {
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));

    const encoded = encodeAuthCode({
      github_access_token: "token",
      github_user_id: "1",
      github_login: "owner-user",
      github_name: "Owner User",
      github_avatar: "",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      redirect_uri: "https://example.com/callback",
      client_id: "client",
      expires_at: Date.now() - 1,
    });

    expect(() => decodeAuthCode(encoded)).toThrow("Authorization code expired");
  });

  it("verifies PKCE and derives deterministic client ids", async () => {
    const verifier = "verifier";
    const challenge = "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ";

    await expect(verifyPkce(verifier, challenge, "S256")).resolves.toBe(true);
    await expect(verifyPkce(verifier, "wrong", "S256")).resolves.toBe(false);
    await expect(verifyPkce(verifier, challenge, "plain")).rejects.toThrow(
      "Unsupported code_challenge_method: plain",
    );

    expect(
      await deriveClientId([
        "https://example.com/b",
        "https://example.com/a",
      ]),
    ).toBe(await deriveClientId(["https://example.com/a", "https://example.com/b"]));
  });
});

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { MCP_ROTATION_GRACE_MS } from "@/lib/mcp/grants";
import { useTestDatabase } from "../../helpers/postgres";

const upsertUserMock = vi.fn();

vi.mock("@/lib/users", () => ({
  upsertUser: upsertUserMock,
}));

describe("MCP callback and token routes", () => {
  useTestDatabase();
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.NEXTAUTH_URL = "https://markbase.test";
  });

  it("handles OAuth callback success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          access_token: "oauth-access-token",
          expires_in: 28_800,
          refresh_token: "oauth-refresh-token",
          refresh_token_expires_in: 15_552_000,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 101,
          login: "owner-user",
          name: "Owner User",
          avatar_url: "https://example.com/owner.png",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { encodeOAuthState } = await import("@/lib/mcp/oauth");
    const { GET } = await import("@/app/api/mcp/callback/route");

    const state = encodeOAuthState({
      code_challenge: "challenge",
      code_challenge_method: "S256",
      redirect_uri: "https://client.test/callback",
      client_id: "client-1",
      client_state: "client-state",
    });

    const request = new NextRequest(
      `https://markbase.test/api/mcp/callback?code=oauth-code&state=${state}`,
    );

    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("https://client.test/callback");
    const { decodeAuthCode } = await import("@/lib/mcp/oauth");
    const redirect = new URL(response.headers.get("location")!);
    const payload = decodeAuthCode(redirect.searchParams.get("code")!);
    expect(payload.github_access_token).toBe("oauth-access-token");
    expect(payload.github_refresh_token).toBe("oauth-refresh-token");
    expect(payload.github_token_expires_at).toBeGreaterThan(Date.now());
    expect(payload.github_refresh_token_expires_at).toBeGreaterThan(
      payload.github_token_expires_at!,
    );
    expect(upsertUserMock).toHaveBeenCalledWith({
      id: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
    });
  });

  it("falls back to login and empty avatars in callback payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: "oauth-access-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 101,
          login: "owner-user",
          name: null,
          avatar_url: null,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { encodeOAuthState } = await import("@/lib/mcp/oauth");
    const { GET } = await import("@/app/api/mcp/callback/route");
    const response = await GET(
      new NextRequest(
        `https://markbase.test/api/mcp/callback?code=oauth-code&state=${encodeOAuthState({
          code_challenge: "challenge",
          code_challenge_method: "S256",
          redirect_uri: "https://client.test/callback",
          client_id: "",
          client_state: "",
        })}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("state=");
    expect(upsertUserMock).toHaveBeenCalledWith({
      id: "101",
      login: "owner-user",
      name: "owner-user",
      avatarUrl: null,
    });
  });

  it("validates callback failures", async () => {
    const { GET } = await import("@/app/api/mcp/callback/route");

    const missing = await GET(
      new NextRequest("https://markbase.test/api/mcp/callback"),
    );
    expect(missing.status).toBe(400);

    const invalid = await GET(
      new NextRequest(
        "https://markbase.test/api/mcp/callback?code=x&state=bad",
      ),
    );
    expect(invalid.status).toBe(400);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        json: async () => ({
          error: "bad_verification_code",
          error_description: "Code invalid",
        }),
      }),
    );
    const { encodeOAuthState } = await import("@/lib/mcp/oauth");
    const tokenFailure = await GET(
      new NextRequest(
        `https://markbase.test/api/mcp/callback?code=x&state=${encodeOAuthState({
          code_challenge: "challenge",
          code_challenge_method: "S256",
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          client_state: "client-state",
        })}`,
      ),
    );
    expect(tokenFailure.status).toBe(400);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        json: async () => ({
          error: "bad_verification_code",
        }),
      }),
    );
    const fallbackTokenFailure = await GET(
      new NextRequest(
        `https://markbase.test/api/mcp/callback?code=x&state=${encodeOAuthState({
          code_challenge: "challenge",
          code_challenge_method: "S256",
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          client_state: "client-state",
        })}`,
      ),
    );
    expect((await fallbackTokenFailure.json()).error_description).toBe(
      "Failed to exchange code for token",
    );

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: "oauth-access-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
        }),
    );
    const profileFailure = await GET(
      new NextRequest(
        `https://markbase.test/api/mcp/callback?code=x&state=${encodeOAuthState({
          code_challenge: "challenge",
          code_challenge_method: "S256",
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          client_state: "client-state",
        })}`,
      ),
    );
    expect(profileFailure.status).toBe(400);
  });

  it("exchanges auth codes for bearer tokens", async () => {
    const { encodeAuthCode } = await import("@/lib/mcp/oauth");
    const { POST } = await import("@/app/api/mcp/token/route");

    const code = encodeAuthCode({
      github_access_token: "oauth-access-token",
      github_user_id: "101",
      github_login: "owner-user",
      github_name: "Owner User",
      github_avatar: "https://example.com/owner.png",
      code_challenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      code_challenge_method: "S256",
      redirect_uri: "https://client.test/callback",
      client_id: "client-1",
      expires_at: Date.now() + 60_000,
    });

    const request = new NextRequest("https://markbase.test/api/mcp/token", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://client.test/callback",
        client_id: "client-1",
        code_verifier: "verifier",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.token_type).toBe("Bearer");
    expect(body.access_token).toEqual(expect.any(String));
  });

  it("exchanges refresh tokens for new token pairs", async () => {
    const { encodeAuthCode } = await import("@/lib/mcp/oauth");
    const { POST } = await import("@/app/api/mcp/token/route");

    // First, get tokens via authorization_code
    const code = encodeAuthCode({
      github_access_token: "oauth-access-token",
      github_user_id: "101",
      github_login: "owner-user",
      github_name: "Owner User",
      github_avatar: "https://example.com/owner.png",
      code_challenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      code_challenge_method: "S256",
      redirect_uri: "https://client.test/callback",
      client_id: "client-1",
      expires_at: Date.now() + 60_000,
    });

    const initial = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          code_verifier: "verifier",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    const initialBody = await initial.json();
    expect(initialBody.refresh_token).toEqual(expect.any(String));

    // Refresh the token
    const refreshed = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: initialBody.refresh_token,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    const refreshedBody = await refreshed.json();
    expect(refreshed.status).toBe(200);
    expect(refreshedBody.access_token).toEqual(expect.any(String));
    expect(refreshedBody.refresh_token).toEqual(expect.any(String));

    // A raced or retried refresh inside the grace window receives the
    // current token pair instead of killing the session.
    const replayed = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: initialBody.refresh_token,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(replayed.status).toBe(200);
    const replayedBody = await replayed.json();
    expect(replayedBody.access_token).toEqual(expect.any(String));

    // Once the grace has elapsed the old refresh token is rejected.
    await getDb()`
      UPDATE mcp_grants
      SET token_rotated_at = NOW() - (${MCP_ROTATION_GRACE_MS + 1_000} * INTERVAL '1 millisecond')
    `;
    const replayedLate = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: initialBody.refresh_token,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(replayedLate.status).toBe(400);
    expect((await replayedLate.json()).error_description).toBe(
      "Refresh token was already used or revoked",
    );

    // Invalid refresh token
    const invalid = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "bad-token",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(invalid.status).toBe(400);

    // Missing refresh token
    const missing = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({ grant_type: "refresh_token" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(missing.status).toBe(400);
  });

  it("validates token exchange failures", async () => {
    const { POST } = await import("@/app/api/mcp/token/route");

    const unsupportedGrant = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({ grant_type: "client_credentials" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(unsupportedGrant.status).toBe(400);

    const missingCode = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({ grant_type: "authorization_code" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(missingCode.status).toBe(400);

    const invalidCode = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "bad",
          code_verifier: "verifier",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(invalidCode.status).toBe(400);

    const { encodeAuthCode } = await import("@/lib/mcp/oauth");
    const code = encodeAuthCode({
      github_access_token: "oauth-access-token",
      github_user_id: "101",
      github_login: "owner-user",
      github_name: "Owner User",
      github_avatar: "https://example.com/owner.png",
      code_challenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      code_challenge_method: "S256",
      redirect_uri: "https://client.test/callback",
      client_id: "client-1",
      expires_at: Date.now() + 60_000,
    });

    const redirectMismatch = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://wrong.test/callback",
          client_id: "client-1",
          code_verifier: "verifier",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(redirectMismatch.status).toBe(400);

    const clientMismatch = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://client.test/callback",
          client_id: "wrong-client",
          code_verifier: "verifier",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(clientMismatch.status).toBe(400);

    const pkceFailure = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          code_verifier: "wrong",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(pkceFailure.status).toBe(400);

    const formEncoded = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          code_verifier: "verifier",
        }).toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
    );
    expect(formEncoded.status).toBe(200);

    const replayedCode = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          code_verifier: "verifier",
        }),
      }),
    );
    expect(replayedCode.status).toBe(400);

    const noContentTypeCode = encodeAuthCode({
      github_access_token: "oauth-access-token",
      github_user_id: "101",
      github_login: "owner-user",
      github_name: "Owner User",
      github_avatar: "https://example.com/owner.png",
      code_challenge: "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ",
      code_challenge_method: "S256",
      redirect_uri: "https://client.test/callback",
      client_id: "client-1",
      expires_at: Date.now() + 60_000,
    });
    const noContentType = await POST(
      new NextRequest("https://markbase.test/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: noContentTypeCode,
          redirect_uri: "https://client.test/callback",
          client_id: "client-1",
          code_verifier: "verifier",
        }),
      }),
    );
    expect(noContentType.status).toBe(200);
  });
});

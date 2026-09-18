// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createDeviceAuthorizationMock,
  findPendingByUserCodeMock,
  authorizeDeviceMock,
  pollDeviceCodeMock,
  consumeDeviceCodeMock,
  consumeMcpAuthorizationCodeMock,
  createMcpGrantMock,
  rotateMcpGrantMock,
  upsertUserMock,
} = vi.hoisted(() => ({
  createDeviceAuthorizationMock: vi.fn(),
  findPendingByUserCodeMock: vi.fn(),
  authorizeDeviceMock: vi.fn(),
  pollDeviceCodeMock: vi.fn(),
  consumeDeviceCodeMock: vi.fn(),
  consumeMcpAuthorizationCodeMock: vi.fn(),
  createMcpGrantMock: vi.fn(),
  rotateMcpGrantMock: vi.fn(),
  upsertUserMock: vi.fn(),
}));

vi.mock("@/lib/mcp/device", () => ({
  DEVICE_CODE_TTL_MS: 15 * 60 * 1000,
  createDeviceAuthorization: createDeviceAuthorizationMock,
  findPendingByUserCode: findPendingByUserCodeMock,
  authorizeDevice: authorizeDeviceMock,
  pollDeviceCode: pollDeviceCodeMock,
  consumeDeviceCode: consumeDeviceCodeMock,
}));
vi.mock("@/lib/mcp/grants", () => ({
  consumeMcpAuthorizationCode: consumeMcpAuthorizationCodeMock,
  createMcpGrant: createMcpGrantMock,
  rotateMcpGrant: rotateMcpGrantMock,
}));
vi.mock("@/lib/users", () => ({ upsertUser: upsertUserMock }));

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function tokenRequest(body: Record<string, string>) {
  return new NextRequest("https://markbase.test/api/mcp/token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("MCP device authorization routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://markbase.test";
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    process.env.GITHUB_WEB_BASE_URL = "https://github.test";
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    createDeviceAuthorizationMock.mockResolvedValue({
      deviceCode: "device-code",
      userCode: "BCDF-GHJK",
      expiresAt: new Date(Date.now() + 900_000),
      interval: 5,
    });
  });

  describe("POST /api/mcp/device", () => {
    it("issues a device code and user code with verification URIs", async () => {
      const { POST } = await import("@/app/api/mcp/device/route");
      const response = await POST(
        new NextRequest("https://markbase.test/api/mcp/device", {
          method: "POST",
          body: JSON.stringify({ client_id: "client-1" }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({
        device_code: "device-code",
        user_code: "BCDF-GHJK",
        verification_uri: "https://markbase.test/mcp/device",
        verification_uri_complete:
          "https://markbase.test/mcp/device?user_code=BCDF-GHJK",
        expires_in: 900,
        interval: 5,
      });
      expect(createDeviceAuthorizationMock).toHaveBeenCalledWith("client-1");
    });

    it("accepts form-encoded, empty, and client-less bodies", async () => {
      const { POST } = await import("@/app/api/mcp/device/route");

      const form = await POST(
        new NextRequest("https://markbase.test/api/mcp/device", {
          method: "POST",
          body: new URLSearchParams({ client_id: "form-client" }).toString(),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      );
      expect(form.status).toBe(200);
      expect(createDeviceAuthorizationMock).toHaveBeenLastCalledWith("form-client");

      const emptyForm = await POST(
        new NextRequest("https://markbase.test/api/mcp/device", {
          method: "POST",
          body: "",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      );
      expect(emptyForm.status).toBe(200);
      expect(createDeviceAuthorizationMock).toHaveBeenLastCalledWith("");

      const empty = await POST(
        new NextRequest("https://markbase.test/api/mcp/device", { method: "POST" }),
      );
      expect(empty.status).toBe(200);
      expect(createDeviceAuthorizationMock).toHaveBeenLastCalledWith("");

      const noClient = await POST(
        new NextRequest("https://markbase.test/api/mcp/device", {
          method: "POST",
          body: JSON.stringify({ client_id: 42 }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(noClient.status).toBe(200);
      expect(createDeviceAuthorizationMock).toHaveBeenLastCalledWith("");
    });

    it("falls back to the production base URL when NEXTAUTH_URL is unset", async () => {
      delete process.env.NEXTAUTH_URL;
      vi.resetModules();
      const { POST } = await import("@/app/api/mcp/device/route");
      const response = await POST(
        new NextRequest("https://markbase.io/api/mcp/device", { method: "POST" }),
      );
      expect((await response.json()).verification_uri).toBe(
        "https://markbase.io/mcp/device",
      );
    });

    it("rejects malformed JSON bodies", async () => {
      const { POST } = await import("@/app/api/mcp/device/route");
      const response = await POST(
        new NextRequest("https://markbase.test/api/mcp/device", {
          method: "POST",
          body: "{not json",
          headers: { "content-type": "application/json" },
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_request");
      expect(createDeviceAuthorizationMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/mcp/device/verify", () => {
    it("requires a user_code", async () => {
      const { GET } = await import("@/app/api/mcp/device/verify/route");
      const response = await GET(
        new NextRequest("https://markbase.test/api/mcp/device/verify"),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error_description).toBe("user_code is required");
      expect(findPendingByUserCodeMock).not.toHaveBeenCalled();
    });

    it("rejects unknown or expired user codes", async () => {
      findPendingByUserCodeMock.mockResolvedValue(null);
      const { GET } = await import("@/app/api/mcp/device/verify/route");
      const response = await GET(
        new NextRequest("https://markbase.test/api/mcp/device/verify?user_code=BCDF-GHJK"),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_request");
      expect(findPendingByUserCodeMock).toHaveBeenCalledWith("BCDF-GHJK");
    });

    it("redirects pending codes to GitHub with a device-tagged state", async () => {
      findPendingByUserCodeMock.mockResolvedValue({
        userCode: "BCDF-GHJK",
        clientId: "client-1",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      });
      const { GET } = await import("@/app/api/mcp/device/verify/route");
      const { decodeOAuthState } = await import("@/lib/mcp/oauth");

      const response = await GET(
        new NextRequest("https://markbase.test/api/mcp/device/verify?user_code=bcdfghjk"),
      );
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.origin + location.pathname).toBe(
        "https://github.test/login/oauth/authorize",
      );
      expect(location.searchParams.get("client_id")).toBe("test-github-id");
      expect(location.searchParams.get("redirect_uri")).toBe(
        "https://markbase.test/api/mcp/callback",
      );
      expect(decodeOAuthState(location.searchParams.get("state")!)).toEqual({
        code_challenge: "",
        code_challenge_method: "none",
        redirect_uri: "https://markbase.test/mcp/device/done",
        client_id: "client-1",
        client_state: "",
        device_user_code: "BCDF-GHJK",
      });
    });
  });

  describe("GET /api/mcp/device/verify without NEXTAUTH_URL", () => {
    it("falls back to the production base URL", async () => {
      delete process.env.NEXTAUTH_URL;
      vi.resetModules();
      findPendingByUserCodeMock.mockResolvedValue({
        userCode: "BCDF-GHJK",
        clientId: "",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      });
      const { GET } = await import("@/app/api/mcp/device/verify/route");
      const { decodeOAuthState } = await import("@/lib/mcp/oauth");
      const response = await GET(
        new NextRequest("https://markbase.io/api/mcp/device/verify?user_code=BCDF-GHJK"),
      );
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("redirect_uri")).toBe(
        "https://markbase.io/api/mcp/callback",
      );
      expect(decodeOAuthState(location.searchParams.get("state")!).redirect_uri).toBe(
        "https://markbase.io/mcp/device/done",
      );
    });
  });

  describe("GET /api/mcp/callback with device state", () => {
    function stubGitHub() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({
            json: async () => ({ access_token: "oauth-access-token" }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              id: 101,
              login: "owner-user",
              name: "Owner User",
              avatar_url: "https://example.com/owner.png",
            }),
          }),
      );
    }

    async function callback() {
      const { encodeOAuthState } = await import("@/lib/mcp/oauth");
      const { GET } = await import("@/app/api/mcp/callback/route");
      const state = encodeOAuthState({
        code_challenge: "",
        code_challenge_method: "none",
        redirect_uri: "https://markbase.test/mcp/device/done",
        client_id: "client-1",
        client_state: "",
        device_user_code: "BCDF-GHJK",
      });
      return GET(
        new NextRequest(
          `https://markbase.test/api/mcp/callback?code=oauth-code&state=${state}`,
        ),
      );
    }

    it("parks the auth code on the device request and lands on the done page", async () => {
      stubGitHub();
      authorizeDeviceMock.mockResolvedValue(true);
      const { decodeAuthCode } = await import("@/lib/mcp/oauth");

      const response = await callback();
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://markbase.test/mcp/device/done",
      );
      expect(authorizeDeviceMock).toHaveBeenCalledWith(
        "BCDF-GHJK",
        expect.any(String),
      );
      const payload = decodeAuthCode(authorizeDeviceMock.mock.calls[0][1]);
      expect(payload.github_access_token).toBe("oauth-access-token");
      expect(payload.client_id).toBe("client-1");
      expect(upsertUserMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to the production base URL for the done page", async () => {
      delete process.env.NEXTAUTH_URL;
      vi.resetModules();
      stubGitHub();
      authorizeDeviceMock.mockResolvedValue(true);

      const response = await callback();
      expect(response.headers.get("location")).toBe(
        "https://markbase.io/mcp/device/done",
      );
    });

    it("reports an expired device request on the done page", async () => {
      stubGitHub();
      authorizeDeviceMock.mockResolvedValue(false);

      const response = await callback();
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://markbase.test/mcp/device/done?error=expired",
      );
    });
  });

  describe("POST /api/mcp/token with the device_code grant", () => {
    it("requires a device_code", async () => {
      const { POST } = await import("@/app/api/mcp/token/route");
      const response = await POST(tokenRequest({ grant_type: DEVICE_GRANT }));
      expect(response.status).toBe(400);
      expect((await response.json()).error_description).toBe("Missing device_code");
      expect(pollDeviceCodeMock).not.toHaveBeenCalled();
    });

    it.each([
      ["pending", "authorization_pending"],
      ["slow_down", "slow_down"],
      ["expired", "expired_token"],
      ["denied", "access_denied"],
      ["unknown", "invalid_grant"],
    ])("maps poll state %s to %s", async (status, error) => {
      pollDeviceCodeMock.mockResolvedValue({ status });
      const { POST } = await import("@/app/api/mcp/token/route");
      const response = await POST(
        tokenRequest({ grant_type: DEVICE_GRANT, device_code: "device-code" }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(error);
      expect(pollDeviceCodeMock).toHaveBeenCalledWith("device-code");
      expect(consumeDeviceCodeMock).not.toHaveBeenCalled();
    });

    it("accepts form-encoded device_code requests", async () => {
      pollDeviceCodeMock.mockResolvedValue({ status: "pending" });
      const { POST } = await import("@/app/api/mcp/token/route");
      const response = await POST(
        new NextRequest("https://markbase.test/api/mcp/token", {
          method: "POST",
          body: new URLSearchParams({
            grant_type: DEVICE_GRANT,
            device_code: "form-device-code",
          }).toString(),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      );
      expect((await response.json()).error).toBe("authorization_pending");
      expect(pollDeviceCodeMock).toHaveBeenCalledWith("form-device-code");
    });

    it("rejects a device code that was consumed by a concurrent poll", async () => {
      pollDeviceCodeMock.mockResolvedValue({ status: "authorized", authCode: "x" });
      consumeDeviceCodeMock.mockResolvedValue(null);
      const { POST } = await import("@/app/api/mcp/token/route");
      const response = await POST(
        tokenRequest({ grant_type: DEVICE_GRANT, device_code: "device-code" }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error_description).toBe(
        "Device code was already used",
      );
    });

    it("rejects a stored auth code that no longer decodes", async () => {
      pollDeviceCodeMock.mockResolvedValue({ status: "authorized", authCode: "bad" });
      consumeDeviceCodeMock.mockResolvedValue("bad");
      const { POST } = await import("@/app/api/mcp/token/route");
      const response = await POST(
        tokenRequest({ grant_type: DEVICE_GRANT, device_code: "device-code" }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_grant");
      expect(consumeMcpAuthorizationCodeMock).not.toHaveBeenCalled();
    });

    it("rejects a replayed auth code and issues tokens otherwise", async () => {
      const { encodeAuthCode } = await import("@/lib/mcp/oauth");
      const code = encodeAuthCode({
        github_access_token: "oauth-access-token",
        github_token_expires_at: Date.now() + 60_000,
        github_refresh_token: "oauth-refresh-token",
        github_refresh_token_expires_at: Date.now() + 120_000,
        github_user_id: "101",
        github_login: "owner-user",
        github_name: "Owner User",
        github_avatar: "https://example.com/owner.png",
        code_challenge: "",
        code_challenge_method: "none",
        redirect_uri: "https://markbase.test/mcp/device/done",
        client_id: "client-1",
        expires_at: Date.now() + 60_000,
      });
      pollDeviceCodeMock.mockResolvedValue({ status: "authorized", authCode: code });
      consumeDeviceCodeMock.mockResolvedValue(code);
      const { POST } = await import("@/app/api/mcp/token/route");

      consumeMcpAuthorizationCodeMock.mockResolvedValueOnce(false);
      const replayed = await POST(
        tokenRequest({ grant_type: DEVICE_GRANT, device_code: "device-code" }),
      );
      expect(replayed.status).toBe(400);
      expect((await replayed.json()).error_description).toBe(
        "Authorization code was already used",
      );
      expect(createMcpGrantMock).not.toHaveBeenCalled();

      consumeMcpAuthorizationCodeMock.mockResolvedValueOnce(true);
      createMcpGrantMock.mockResolvedValue({
        id: "grant-1",
        userId: "101",
        login: "owner-user",
        name: "Owner User",
        avatarUrl: "https://example.com/owner.png",
        githubToken: "oauth-access-token",
        tokenVersion: 1,
      });
      const issued = await POST(
        tokenRequest({ grant_type: DEVICE_GRANT, device_code: "device-code" }),
      );
      expect(issued.status).toBe(200);
      const body = await issued.json();
      expect(body.token_type).toBe("Bearer");
      expect(body.access_token).toEqual(expect.any(String));
      expect(body.refresh_token).toEqual(expect.any(String));
      expect(consumeMcpAuthorizationCodeMock).toHaveBeenLastCalledWith(code);
      expect(createMcpGrantMock).toHaveBeenCalledWith({
        userId: "101",
        login: "owner-user",
        name: "Owner User",
        avatarUrl: "https://example.com/owner.png",
        githubToken: "oauth-access-token",
        githubTokenExpiresAt: expect.any(Number),
        githubRefreshToken: "oauth-refresh-token",
        githubRefreshTokenExpiresAt: expect.any(Number),
      });
    });
  });
});

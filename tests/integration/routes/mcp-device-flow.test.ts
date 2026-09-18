// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { DEVICE_POLL_INTERVAL_SECONDS } from "@/lib/mcp/device";
import { useTestDatabase } from "../../helpers/postgres";

const upsertUserMock = vi.fn();

vi.mock("@/lib/users", () => ({
  upsertUser: upsertUserMock,
}));

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function stubGitHub() {
  vi.stubGlobal(
    "fetch",
    vi
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
      }),
  );
}

async function requestDeviceCode() {
  const { POST } = await import("@/app/api/mcp/device/route");
  const response = await POST(
    new NextRequest("https://markbase.test/api/mcp/device", {
      method: "POST",
      body: new URLSearchParams({ client_id: "client-1" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  }>;
}

async function pollToken(deviceCode: string) {
  const { POST } = await import("@/app/api/mcp/token/route");
  return POST(
    new NextRequest("https://markbase.test/api/mcp/token", {
      method: "POST",
      body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code: deviceCode }),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function allowNextPoll(userCode: string) {
  await getDb()`
    UPDATE mcp_device_codes
    SET last_polled_at = NOW() - (${(DEVICE_POLL_INTERVAL_SECONDS + 1) * 1000} * INTERVAL '1 millisecond')
    WHERE user_code = ${userCode}
  `;
}

async function approveInBrowser(userCode: string) {
  const { GET: verify } = await import("@/app/api/mcp/device/verify/route");
  const redirect = await verify(
    new NextRequest(
      `https://markbase.test/api/mcp/device/verify?user_code=${encodeURIComponent(userCode)}`,
    ),
  );
  expect(redirect.status).toBe(302);
  const githubUrl = new URL(redirect.headers.get("location")!);
  expect(githubUrl.origin + githubUrl.pathname).toBe(
    "https://github.test/login/oauth/authorize",
  );
  const state = githubUrl.searchParams.get("state")!;

  stubGitHub();
  const { GET: callback } = await import("@/app/api/mcp/callback/route");
  return callback(
    new NextRequest(
      `https://markbase.test/api/mcp/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
    ),
  );
}

describe("MCP device authorization flow", () => {
  useTestDatabase();
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    process.env.GITHUB_WEB_BASE_URL = "https://github.test";
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.NEXTAUTH_URL = "https://markbase.test";
  });

  it("issues tokens after the user approves in a browser", async () => {
    const device = await requestDeviceCode();
    expect(device.verification_uri).toBe("https://markbase.test/mcp/device");
    expect(device.verification_uri_complete).toBe(
      `https://markbase.test/mcp/device?user_code=${device.user_code}`,
    );
    expect(device.expires_in).toBe(900);
    expect(device.interval).toBe(5);

    const pending = await pollToken(device.device_code);
    expect(pending.status).toBe(400);
    expect((await pending.json()).error).toBe("authorization_pending");

    const tooFast = await pollToken(device.device_code);
    expect((await tooFast.json()).error).toBe("slow_down");

    const done = await approveInBrowser(device.user_code.toLowerCase());
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe(
      "https://markbase.test/mcp/device/done",
    );
    expect(upsertUserMock).toHaveBeenCalledWith({
      id: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
    });

    const issued = await pollToken(device.device_code);
    expect(issued.status).toBe(200);
    const tokens = await issued.json();
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.access_token).toEqual(expect.any(String));
    expect(tokens.refresh_token).toEqual(expect.any(String));

    const { verifyMcpToken } = await import("@/lib/mcp/jwt");
    const { getMcpGrant } = await import("@/lib/mcp/grants");
    const payload = await verifyMcpToken(tokens.access_token);
    await expect(
      getMcpGrant(payload.grant_id, payload.token_version),
    ).resolves.toMatchObject({
      userId: "101",
      login: "owner-user",
      githubToken: "oauth-access-token",
    });

    // The device code is single-use.
    const replayed = await pollToken(device.device_code);
    expect(replayed.status).toBe(400);
    expect((await replayed.json()).error).toBe("invalid_grant");

    // The user code cannot be approved twice.
    const { GET: verify } = await import("@/app/api/mcp/device/verify/route");
    const reused = await verify(
      new NextRequest(
        `https://markbase.test/api/mcp/device/verify?user_code=${device.user_code}`,
      ),
    );
    expect(reused.status).toBe(400);
  });

  it("reports expiry to both the browser and the polling client", async () => {
    const device = await requestDeviceCode();
    const { GET: verify } = await import("@/app/api/mcp/device/verify/route");
    const redirect = await verify(
      new NextRequest(
        `https://markbase.test/api/mcp/device/verify?user_code=${device.user_code}`,
      ),
    );
    const state = new URL(redirect.headers.get("location")!).searchParams.get(
      "state",
    )!;

    await getDb()`
      UPDATE mcp_device_codes
      SET expires_at = NOW() - INTERVAL '1 second'
      WHERE user_code = ${device.user_code}
    `;

    stubGitHub();
    const { GET: callback } = await import("@/app/api/mcp/callback/route");
    const done = await callback(
      new NextRequest(
        `https://markbase.test/api/mcp/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
      ),
    );
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe(
      "https://markbase.test/mcp/device/done?error=expired",
    );

    const expired = await pollToken(device.device_code);
    expect(expired.status).toBe(400);
    expect((await expired.json()).error).toBe("expired_token");
  });

  it("reports denied requests and rejects unknown device codes", async () => {
    const device = await requestDeviceCode();
    const { denyDevice } = await import("@/lib/mcp/device");
    await expect(denyDevice(device.user_code)).resolves.toBe(true);

    const denied = await pollToken(device.device_code);
    expect(denied.status).toBe(400);
    expect((await denied.json()).error).toBe("access_denied");

    const unknown = await pollToken("never-issued");
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error).toBe("invalid_grant");

    const missing = await pollToken("");
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("invalid_request");
  });

  it("keeps polling honest across the interval", async () => {
    const device = await requestDeviceCode();
    expect((await (await pollToken(device.device_code)).json()).error).toBe(
      "authorization_pending",
    );
    expect((await (await pollToken(device.device_code)).json()).error).toBe(
      "slow_down",
    );
    await allowNextPoll(device.user_code);
    expect((await (await pollToken(device.device_code)).json()).error).toBe(
      "authorization_pending",
    );
  });
});

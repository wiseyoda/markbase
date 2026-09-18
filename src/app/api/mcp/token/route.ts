import { NextRequest, NextResponse } from "next/server";
import { decodeAuthCode, verifyPkce } from "@/lib/mcp/oauth";
import {
  signMcpToken,
  signMcpRefreshToken,
  verifyMcpRefreshToken,
  ACCESS_EXPIRES_IN,
} from "@/lib/mcp/jwt";
import {
  consumeMcpAuthorizationCode,
  createMcpGrant,
  rotateMcpGrant,
  type McpGrant,
} from "@/lib/mcp/grants";
import { consumeDeviceCode, pollDeviceCode } from "@/lib/mcp/device";
import type { AuthCodePayload } from "@/lib/mcp/types";

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

async function parseBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await req.text());
    return {
      grantType: form.get("grant_type"),
      code: form.get("code"),
      redirectUri: form.get("redirect_uri"),
      clientId: form.get("client_id"),
      codeVerifier: form.get("code_verifier"),
      refreshToken: form.get("refresh_token"),
      deviceCode: form.get("device_code"),
    };
  }
  const body = await req.json();
  return {
    grantType: body.grant_type ?? null,
    code: body.code ?? null,
    redirectUri: body.redirect_uri ?? null,
    clientId: body.client_id ?? null,
    codeVerifier: body.code_verifier ?? null,
    refreshToken: body.refresh_token ?? null,
    deviceCode: body.device_code ?? null,
  };
}

async function issueTokens(grant: McpGrant) {
  const payload = {
    sub: grant.userId,
    grantId: grant.id,
    tokenVersion: grant.tokenVersion,
  };
  const [accessToken, refreshToken] = await Promise.all([
    signMcpToken(payload),
    signMcpRefreshToken(payload),
  ]);

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_EXPIRES_IN,
    refresh_token: refreshToken,
    scope: "comments",
  });
}

async function handleAuthorizationCode(params: {
  code: string | null;
  codeVerifier: string | null;
  redirectUri: string | null;
  clientId: string | null;
}) {
  const { code, codeVerifier, redirectUri, clientId } = params;

  if (!code || !codeVerifier) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing code or code_verifier" },
      { status: 400 },
    );
  }

  let authCode;
  try {
    authCode = decodeAuthCode(code);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: err instanceof Error ? err.message : "Invalid authorization code",
      },
      { status: 400 },
    );
  }

  if (redirectUri && redirectUri !== authCode.redirect_uri) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400 },
    );
  }

  if (clientId && clientId !== authCode.client_id) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "client_id mismatch" },
      { status: 400 },
    );
  }

  const pkceValid = await verifyPkce(
    codeVerifier,
    authCode.code_challenge,
    authCode.code_challenge_method,
  );

  if (!pkceValid) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 },
    );
  }

  return redeemAuthCode(code, authCode);
}

/** Single-use redemption shared by the authorization-code and device grants. */
async function redeemAuthCode(code: string, authCode: AuthCodePayload) {
  if (!(await consumeMcpAuthorizationCode(code))) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Authorization code was already used" },
      { status: 400 },
    );
  }

  const grant = await createMcpGrant({
    userId: authCode.github_user_id,
    login: authCode.github_login,
    name: authCode.github_name,
    avatarUrl: authCode.github_avatar,
    githubToken: authCode.github_access_token,
    githubTokenExpiresAt: authCode.github_token_expires_at,
    githubRefreshToken: authCode.github_refresh_token,
    githubRefreshTokenExpiresAt: authCode.github_refresh_token_expires_at,
  });
  return issueTokens(grant);
}

/** RFC 8628 section 3.4/3.5: device access token request. */
async function handleDeviceCode(deviceCode: string | null) {
  if (!deviceCode) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing device_code" },
      { status: 400 },
    );
  }

  const poll = await pollDeviceCode(deviceCode);
  switch (poll.status) {
    case "pending":
      return NextResponse.json({ error: "authorization_pending" }, { status: 400 });
    case "slow_down":
      return NextResponse.json({ error: "slow_down" }, { status: 400 });
    case "expired":
      return NextResponse.json({ error: "expired_token" }, { status: 400 });
    case "denied":
      return NextResponse.json({ error: "access_denied" }, { status: 400 });
    case "unknown":
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Unknown device code" },
        { status: 400 },
      );
    case "authorized":
      break;
  }

  // Take the stored auth code exactly once, even under concurrent polls.
  const code = await consumeDeviceCode(deviceCode);
  if (!code) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Device code was already used" },
      { status: 400 },
    );
  }

  // The embedded PKCE challenge belongs to the browser leg and is not
  // verified here; possession of the device_code is the client proof.
  let authCode;
  try {
    authCode = decodeAuthCode(code);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: err instanceof Error ? err.message : "Invalid authorization code",
      },
      { status: 400 },
    );
  }

  return redeemAuthCode(code, authCode);
}

async function handleRefreshToken(refreshToken: string | null) {
  if (!refreshToken) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing refresh_token" },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = await verifyMcpRefreshToken(refreshToken);
  } catch {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
      { status: 400 },
    );
  }

  const grant = await rotateMcpGrant(payload.grant_id, payload.token_version);
  if (!grant) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Refresh token was already used or revoked" },
      { status: 400 },
    );
  }
  return issueTokens(grant);
}

export async function POST(req: NextRequest) {
  const params = await parseBody(req);

  switch (params.grantType) {
    case "authorization_code":
      return handleAuthorizationCode(params);
    case "refresh_token":
      return handleRefreshToken(params.refreshToken);
    case DEVICE_CODE_GRANT:
      return handleDeviceCode(params.deviceCode);
    default:
      return NextResponse.json(
        { error: "unsupported_grant_type" },
        { status: 400 },
      );
  }
}

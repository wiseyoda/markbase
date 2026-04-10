import { NextRequest, NextResponse } from "next/server";
import { decodeAuthCode, verifyPkce } from "@/lib/mcp/oauth";
import {
  signMcpToken,
  signMcpRefreshToken,
  verifyMcpRefreshToken,
  ACCESS_EXPIRES_IN,
} from "@/lib/mcp/jwt";

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
  };
}

interface TokenPayload {
  sub: string;
  login: string;
  name: string;
  avatar_url: string;
  githubToken: string;
}

async function issueTokens(payload: TokenPayload) {
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

  return issueTokens({
    sub: authCode.github_user_id,
    login: authCode.github_login,
    name: authCode.github_name,
    avatar_url: authCode.github_avatar,
    githubToken: authCode.github_access_token,
  });
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

  // Issue new access + refresh token pair (token rotation)
  return issueTokens({
    sub: payload.sub,
    login: payload.login,
    name: payload.name,
    avatar_url: payload.avatar_url,
    githubToken: payload.github_token,
  });
}

export async function POST(req: NextRequest) {
  const params = await parseBody(req);

  switch (params.grantType) {
    case "authorization_code":
      return handleAuthorizationCode(params);
    case "refresh_token":
      return handleRefreshToken(params.refreshToken);
    default:
      return NextResponse.json(
        { error: "unsupported_grant_type" },
        { status: 400 },
      );
  }
}

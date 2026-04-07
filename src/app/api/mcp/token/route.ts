import { NextRequest, NextResponse } from "next/server";
import { decodeAuthCode, verifyPkce } from "@/lib/mcp/oauth";
import { signMcpToken } from "@/lib/mcp/jwt";

export async function POST(req: NextRequest) {
  // Parse body from either form-encoded or JSON
  const contentType = req.headers.get("content-type") || "";
  let grantType: string | null = null;
  let code: string | null = null;
  let redirectUri: string | null = null;
  let clientId: string | null = null;
  let codeVerifier: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await req.text());
    grantType = form.get("grant_type");
    code = form.get("code");
    redirectUri = form.get("redirect_uri");
    clientId = form.get("client_id");
    codeVerifier = form.get("code_verifier");
  } else {
    const body = await req.json();
    grantType = body.grant_type ?? null;
    code = body.code ?? null;
    redirectUri = body.redirect_uri ?? null;
    clientId = body.client_id ?? null;
    codeVerifier = body.code_verifier ?? null;
  }

  if (grantType !== "authorization_code") {
    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400 },
    );
  }

  if (!code || !codeVerifier) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing code or code_verifier" },
      { status: 400 },
    );
  }

  // Decrypt and validate the auth code
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

  // Validate redirect_uri and client_id match what was used during authorization
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

  // Verify PKCE code_verifier against the stored code_challenge
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

  // Sign a JWT access token
  const accessToken = await signMcpToken({
    sub: authCode.github_user_id,
    login: authCode.github_login,
    name: authCode.github_name,
    avatar_url: authCode.github_avatar,
    githubToken: authCode.github_access_token,
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 28800,
    scope: "comments",
  });
}

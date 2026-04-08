import { NextRequest, NextResponse } from "next/server";
import { decodeOAuthState, encodeAuthCode } from "@/lib/mcp/oauth";
import { githubApiUrl, githubWebUrl } from "@/lib/github-config";
import { upsertUser } from "@/lib/users";

const GITHUB_ID = process.env.GITHUB_ID!;
const GITHUB_SECRET = process.env.GITHUB_SECRET!;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing code or state parameter" },
      { status: 400 },
    );
  }

  // Decrypt our OAuth state to recover PKCE challenge and redirect info
  let oauthState;
  try {
    oauthState = decodeOAuthState(state);
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Invalid or corrupted state parameter" },
      { status: 400 },
    );
  }

  // Exchange GitHub authorization code for access token
  const tokenRes = await fetch(githubWebUrl("/login/oauth/access_token"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GITHUB_ID,
      client_secret: GITHUB_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.json(
      {
        error: "oauth_error",
        error_description: tokenData.error_description || "Failed to exchange code for token",
      },
      { status: 400 },
    );
  }

  const accessToken: string = tokenData.access_token;

  // Fetch GitHub user profile
  const userRes = await fetch(githubApiUrl("/user"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userRes.ok) {
    return NextResponse.json(
      { error: "oauth_error", error_description: "Failed to fetch GitHub user profile" },
      { status: 400 },
    );
  }

  const user = await userRes.json();

  // Persist user in our database
  await upsertUser({
    id: String(user.id),
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url,
  });

  // Create an encrypted auth code carrying the GitHub token and PKCE challenge
  const authCode = encodeAuthCode({
    github_access_token: accessToken,
    github_user_id: String(user.id),
    github_login: user.login,
    github_name: user.name || user.login,
    github_avatar: user.avatar_url || "",
    code_challenge: oauthState.code_challenge,
    code_challenge_method: oauthState.code_challenge_method,
    redirect_uri: oauthState.redirect_uri,
    client_id: oauthState.client_id,
    expires_at: Date.now() + 10 * 60 * 1000,
  });

  const redirectUrl = new URL(oauthState.redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  redirectUrl.searchParams.set("state", oauthState.client_state);

  return NextResponse.redirect(redirectUrl.toString(), 302);
}

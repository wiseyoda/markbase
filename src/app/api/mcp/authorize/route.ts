import { NextRequest, NextResponse } from "next/server";
import { encodeOAuthState } from "@/lib/mcp/oauth";
import type { OAuthState } from "@/lib/mcp/types";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase-github.vercel.app";
const GITHUB_ID = process.env.GITHUB_ID!;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  if (responseType !== "code") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "response_type must be 'code'" },
      { status: 400 },
    );
  }

  if (!codeChallenge) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "code_challenge is required" },
      { status: 400 },
    );
  }

  if (codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "code_challenge_method must be 'S256'" },
      { status: 400 },
    );
  }

  if (!redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri is required" },
      { status: 400 },
    );
  }

  const oauthState: OAuthState = {
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    redirect_uri: redirectUri,
    client_id: clientId || "",
    client_state: state || "",
  };

  const encryptedState = encodeOAuthState(oauthState);

  const githubUrl =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${GITHUB_ID}` +
    `&redirect_uri=${encodeURIComponent(`${BASE_URL}/api/mcp/callback`)}` +
    `&scope=${encodeURIComponent("read:user user:email repo")}` +
    `&state=${encryptedState}`;

  return NextResponse.redirect(githubUrl, 302);
}

import { NextRequest, NextResponse } from "next/server";
import { encodeOAuthState } from "@/lib/mcp/oauth";
import { findPendingByUserCode } from "@/lib/mcp/device";
import { githubWebUrl } from "@/lib/github-config";
import type { OAuthState } from "@/lib/mcp/types";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase.io";
const GITHUB_ID = process.env.GITHUB_ID!;

/**
 * Browser-side half of the device flow: the user submits the code shown in
 * their terminal, and we send them through GitHub exactly like the
 * authorization-code flow, tagging the state with the device request.
 */
export async function GET(req: NextRequest) {
  const userCode = req.nextUrl.searchParams.get("user_code");
  if (!userCode) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "user_code is required" },
      { status: 400 },
    );
  }

  const record = await findPendingByUserCode(userCode);
  if (!record) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Unknown, expired, or already used device code",
      },
      { status: 400 },
    );
  }

  const oauthState: OAuthState = {
    code_challenge: "",
    code_challenge_method: "none",
    redirect_uri: `${BASE_URL}/mcp/device/done`,
    client_id: record.clientId,
    client_state: "",
    device_user_code: record.userCode,
  };

  const githubUrl =
    githubWebUrl("/login/oauth/authorize") +
    `?client_id=${GITHUB_ID}` +
    `&redirect_uri=${encodeURIComponent(`${BASE_URL}/api/mcp/callback`)}` +
    `&scope=${encodeURIComponent("read:user user:email repo")}` +
    `&state=${encodeOAuthState(oauthState)}`;

  return NextResponse.redirect(githubUrl, 302);
}

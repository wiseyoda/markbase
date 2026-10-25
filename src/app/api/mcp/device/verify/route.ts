import { NextRequest, NextResponse } from "next/server";
import { encodeOAuthState } from "@/lib/mcp/oauth";
import { findPendingByUserCode } from "@/lib/mcp/device";
import { githubWebUrl } from "@/lib/github-config";
import type { OAuthState } from "@/lib/mcp/types";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase.io";
const GITHUB_ID = process.env.GITHUB_ID!;

/**
 * A GET with a user_code must never start OAuth (RFC 8628 §5.4): a link such as
 * /api/mcp/device/verify?user_code=XXXX on the real domain would otherwise bind
 * the victim's GitHub identity to an attacker's device request in one click.
 * The code is only prefilled on the confirmation page.
 */
export async function GET(req: NextRequest) {
  const userCode = req.nextUrl.searchParams.get("user_code");
  const target = new URL("/mcp/device", BASE_URL);
  if (userCode) target.searchParams.set("user_code", userCode);
  return NextResponse.redirect(target, 303);
}

function isSameOriginSubmission(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) return origin === new URL(BASE_URL).origin;
  // Older clients omit Origin on same-origin form posts; the fetch metadata
  // header is then the next best signal.
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Browser-side half of the device flow: the user confirms the code shown in
 * their terminal on our page, and we send them through GitHub exactly like the
 * authorization-code flow, tagging the state with the device request.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginSubmission(req)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Cross-site submission rejected" },
      { status: 403 },
    );
  }

  const form = await req.formData().catch(() => null);
  const userCode = form?.get("user_code");
  if (typeof userCode !== "string" || !userCode) {
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

  return NextResponse.redirect(githubUrl, 303);
}

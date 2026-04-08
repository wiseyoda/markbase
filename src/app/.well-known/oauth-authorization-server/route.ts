import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase.io";

export function GET() {
  return NextResponse.json(
    {
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/api/mcp/authorize`,
      token_endpoint: `${BASE_URL}/api/mcp/token`,
      registration_endpoint: `${BASE_URL}/api/mcp/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["comments"],
    },
    {
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}

import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase-github.vercel.app";

export function GET() {
  return NextResponse.json(
    {
      resource: `${BASE_URL}/api/mcp`,
      authorization_servers: [BASE_URL],
      scopes_supported: ["comments"],
      bearer_methods_supported: ["header"],
    },
    {
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}

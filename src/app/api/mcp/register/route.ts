import { NextRequest, NextResponse } from "next/server";
import { deriveClientId } from "@/lib/mcp/oauth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const redirectUris: string[] | undefined = body.redirect_uris;

  if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: "redirect_uris is required and must be a non-empty array" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    client_id: await deriveClientId(redirectUris),
    client_name: body.client_name || "MCP Client",
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

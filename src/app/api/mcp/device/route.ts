import { NextRequest, NextResponse } from "next/server";
import {
  DEVICE_CODE_TTL_MS,
  createDeviceAuthorization,
} from "@/lib/mcp/device";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase.io";

/** `client_id` is optional; form-urlencoded and JSON bodies are accepted. */
async function parseClientId(
  req: NextRequest,
): Promise<{ clientId: string } | { error: NextResponse }> {
  const contentType = req.headers.get("content-type") || "";
  const text = await req.text();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { clientId: new URLSearchParams(text).get("client_id") || "" };
  }
  if (!text.trim()) return { clientId: "" };
  try {
    const body = JSON.parse(text);
    return {
      clientId: typeof body?.client_id === "string" ? body.client_id : "",
    };
  } catch {
    return {
      error: NextResponse.json(
        { error: "invalid_request", error_description: "Malformed request body" },
        { status: 400 },
      ),
    };
  }
}

/** RFC 8628 section 3.1/3.2: device authorization request and response. */
export async function POST(req: NextRequest) {
  const parsed = await parseClientId(req);
  if ("error" in parsed) return parsed.error;

  const authorization = await createDeviceAuthorization(parsed.clientId);
  const verificationUri = `${BASE_URL}/mcp/device`;

  return NextResponse.json(
    {
      device_code: authorization.deviceCode,
      user_code: authorization.userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(
        authorization.userCode,
      )}`,
      expires_in: DEVICE_CODE_TTL_MS / 1000,
      interval: authorization.interval,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

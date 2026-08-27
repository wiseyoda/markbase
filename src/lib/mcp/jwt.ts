import { SignJWT, jwtVerify } from "jose";
import type { McpJwtPayload } from "./types";

const ISSUER = "markbase";
const ACCESS_AUDIENCE = "mcp";
const REFRESH_AUDIENCE = "mcp-refresh";
const ACCESS_EXPIRY = "7d";
const REFRESH_EXPIRY = "90d";
const ACCESS_EXPIRES_IN = 7 * 24 * 60 * 60; // 604800 seconds
const REFRESH_EXPIRES_IN = 90 * 24 * 60 * 60; // 7776000 seconds

let signingKey: Uint8Array | null = null;

function getSigningKey(): Uint8Array {
  if (signingKey) return signingKey;

  const hex = process.env.SHARE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("SHARE_ENCRYPTION_KEY must be a 64-char hex string");
  }

  // Use first 32 bytes of the encryption key as HMAC signing key
  // (distinct from encryption usage since HMAC-SHA256 and AES-256-GCM
  // are different algorithms operating on the same key material)
  signingKey = new Uint8Array(Buffer.from(hex, "hex"));
  return signingKey;
}

interface McpTokenInput {
  sub: string;
  grantId: string;
  tokenVersion: number;
}

async function signJwt(
  payload: McpTokenInput,
  audience: string,
  expiry: string,
): Promise<string> {
  return new SignJWT({
    grant_id: payload.grantId,
    token_version: payload.tokenVersion,
  } satisfies Omit<McpJwtPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setSubject(payload.sub)
    .setExpirationTime(expiry)
    .sign(getSigningKey());
}

export async function signMcpToken(
  payload: McpTokenInput,
): Promise<string> {
  return signJwt(payload, ACCESS_AUDIENCE, ACCESS_EXPIRY);
}

export async function signMcpRefreshToken(
  payload: McpTokenInput,
): Promise<string> {
  return signJwt(payload, REFRESH_AUDIENCE, REFRESH_EXPIRY);
}

export async function verifyMcpToken(token: string): Promise<McpJwtPayload> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
  });

  const p = payload as unknown as McpJwtPayload & { sub: string };
  if (
    typeof p.sub !== "string" ||
    typeof p.grant_id !== "string" ||
    !Number.isInteger(p.token_version)
  ) {
    throw new Error("Invalid MCP token payload");
  }

  return {
    sub: p.sub,
    grant_id: p.grant_id,
    token_version: p.token_version,
  };
}

export async function verifyMcpRefreshToken(
  token: string,
): Promise<McpJwtPayload> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: ISSUER,
    audience: REFRESH_AUDIENCE,
  });

  const p = payload as unknown as McpJwtPayload & { sub: string };
  if (
    typeof p.sub !== "string" ||
    typeof p.grant_id !== "string" ||
    !Number.isInteger(p.token_version)
  ) {
    throw new Error("Invalid MCP token payload");
  }

  return {
    sub: p.sub,
    grant_id: p.grant_id,
    token_version: p.token_version,
  };
}

export { ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN };

import { SignJWT, jwtVerify } from "jose";
import { encrypt, decrypt } from "@/lib/crypto";
import type { McpJwtPayload } from "./types";

const ISSUER = "markbase";
const AUDIENCE = "mcp";
const EXPIRY = "8h";

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

export async function signMcpToken(payload: {
  sub: string;
  login: string;
  name: string;
  avatar_url: string;
  githubToken: string;
}): Promise<string> {
  const encryptedToken = encrypt(payload.githubToken);

  return new SignJWT({
    login: payload.login,
    name: payload.name,
    avatar_url: payload.avatar_url,
    github_token: encryptedToken,
  } satisfies Omit<McpJwtPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(payload.sub)
    .setExpirationTime(EXPIRY)
    .sign(getSigningKey());
}

export async function verifyMcpToken(token: string): Promise<McpJwtPayload> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const p = payload as unknown as McpJwtPayload & { sub: string };

  return {
    sub: p.sub,
    login: p.login,
    name: p.name,
    avatar_url: p.avatar_url,
    github_token: decrypt(p.github_token),
  };
}

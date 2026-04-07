import { encrypt, decrypt } from "@/lib/crypto";
import type { OAuthState, AuthCodePayload } from "./types";

export function encodeOAuthState(state: OAuthState): string {
  return encodeURIComponent(encrypt(JSON.stringify(state)));
}

export function decodeOAuthState(encoded: string): OAuthState {
  return JSON.parse(decrypt(decodeURIComponent(encoded)));
}

export function encodeAuthCode(payload: AuthCodePayload): string {
  return encodeURIComponent(encrypt(JSON.stringify(payload)));
}

export function decodeAuthCode(encoded: string): AuthCodePayload {
  const payload: AuthCodePayload = JSON.parse(
    decrypt(decodeURIComponent(encoded)),
  );

  if (payload.expires_at < Date.now()) {
    throw new Error("Authorization code expired");
  }

  return payload;
}

/** Verify PKCE S256: SHA-256(code_verifier) === code_challenge */
export async function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): Promise<boolean> {
  if (method !== "S256") {
    throw new Error(`Unsupported code_challenge_method: ${method}`);
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );

  const encoded = Buffer.from(digest)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return encoded === codeChallenge;
}

/** Deterministic client_id from redirect URIs */
export async function deriveClientId(
  redirectUris: string[],
): Promise<string> {
  const sorted = [...redirectUris].sort().join(",");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sorted),
  );
  return Buffer.from(digest).toString("hex").slice(0, 16);
}

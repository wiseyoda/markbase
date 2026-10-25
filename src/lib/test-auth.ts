import { createHmac, timingSafeEqual } from "node:crypto";

export const TEST_AUTH_COOKIE = "markbase-test-session";

export interface TestAuthPayload {
  id: string;
  login: string;
  name: string;
  accessToken: string;
  image?: string | null;
}

function testSecret(): string {
  const secret = process.env.MARKBASE_TEST_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MARKBASE_TEST_SECRET (>=32 chars) is required for test auth cookies");
  }
  return secret;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * Test-mode session cookie: base64url(JSON) + "." + HMAC-SHA256 over the body,
 * keyed by MARKBASE_TEST_SECRET. Without the MAC anyone could forge a session
 * for any user id wherever test mode is enabled.
 */
export function encodeTestAuthCookie(payload: TestAuthPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, testSecret())}`;
}

export function decodeTestAuthCookie(cookie: string): TestAuthPayload {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) throw new Error("Invalid test auth cookie");
  const body = cookie.slice(0, dot);
  const provided = Buffer.from(cookie.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(body, testSecret()), "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Invalid test auth cookie");
  }

  const parsed = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as Partial<TestAuthPayload>;

  if (
    !parsed.id ||
    !parsed.login ||
    !parsed.name ||
    !parsed.accessToken
  ) {
    throw new Error("Invalid test auth cookie");
  }

  return {
    id: parsed.id,
    login: parsed.login,
    name: parsed.name,
    accessToken: parsed.accessToken,
    image: parsed.image ?? null,
  };
}

export const TEST_AUTH_COOKIE = "markbase-test-session";

export interface TestAuthPayload {
  id: string;
  login: string;
  name: string;
  accessToken: string;
  image?: string | null;
}

export function encodeTestAuthCookie(payload: TestAuthPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeTestAuthCookie(cookie: string): TestAuthPayload {
  const parsed = JSON.parse(
    Buffer.from(cookie, "base64url").toString("utf8"),
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

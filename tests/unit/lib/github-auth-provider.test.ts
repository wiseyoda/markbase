import { describe, expect, it } from "vitest";
import GitHub from "next-auth/providers/github";

describe("GitHub auth provider", () => {
  it("validates GitHub's RFC 9207 issuer on OAuth callbacks", () => {
    const provider = GitHub({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    });

    expect(provider.issuer).toBe("https://github.com/login/oauth");
  });
});

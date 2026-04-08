// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

describe("crypto", () => {
  afterEach(() => {
    delete process.env.SHARE_ENCRYPTION_KEY;
  });

  it("encrypts and decrypts values", () => {
    process.env.SHARE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const encoded = encrypt("secret-token");

    expect(encoded).not.toContain("secret-token");
    expect(decrypt(encoded)).toBe("secret-token");
  });

  it("rejects invalid keys", () => {
    process.env.SHARE_ENCRYPTION_KEY = "short";

    expect(() => encrypt("value")).toThrow(
      "SHARE_ENCRYPTION_KEY must be a 64-char hex string",
    );
  });
});

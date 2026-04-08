import { describe, expect, it } from "vitest";
import { decodeTestAuthCookie, encodeTestAuthCookie } from "@/lib/test-auth";

describe("test auth helpers", () => {
  it("encodes and decodes cookies", () => {
    const cookie = encodeTestAuthCookie({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      accessToken: "owner-token",
      image: null,
    });

    expect(decodeTestAuthCookie(cookie)).toEqual({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      accessToken: "owner-token",
      image: null,
    });
  });

  it("rejects malformed cookies", () => {
    const invalid = Buffer.from(JSON.stringify({ id: "1" }), "utf8").toString(
      "base64url",
    );

    expect(() => decodeTestAuthCookie(invalid)).toThrow(
      "Invalid test auth cookie",
    );
  });
});

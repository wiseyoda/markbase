import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeTestAuthCookie, encodeTestAuthCookie } from "@/lib/test-auth";

const SECRET = "test-secret-that-is-at-least-32-characters";

describe("test auth helpers", () => {
  beforeEach(() => {
    process.env.MARKBASE_TEST_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.MARKBASE_TEST_SECRET;
  });

  it("encodes and decodes signed cookies", () => {
    const cookie = encodeTestAuthCookie({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      accessToken: "owner-token",
      image: null,
    });

    expect(cookie).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(decodeTestAuthCookie(cookie)).toEqual({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      accessToken: "owner-token",
      image: null,
    });
  });

  it("rejects unsigned, tampered, and malformed cookies", () => {
    const unsigned = Buffer.from(
      JSON.stringify({ id: "1", login: "x", name: "x", accessToken: "x" }),
      "utf8",
    ).toString("base64url");
    expect(() => decodeTestAuthCookie(unsigned)).toThrow("Invalid test auth cookie");

    const genuine = encodeTestAuthCookie({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      accessToken: "owner-token",
    });
    const [, signature] = genuine.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ id: "2", login: "victim", name: "Victim", accessToken: "owner-token" }),
      "utf8",
    ).toString("base64url");
    expect(() => decodeTestAuthCookie(`${forgedBody}.${signature}`)).toThrow(
      "Invalid test auth cookie",
    );

    const incomplete = Buffer.from(JSON.stringify({ id: "1" }), "utf8").toString("base64url");
    expect(() => decodeTestAuthCookie(`${incomplete}.AAAA`)).toThrow(
      "Invalid test auth cookie",
    );
  });

  it("rejects a correctly signed cookie whose payload is incomplete", () => {
    const signedButIncomplete = encodeTestAuthCookie({ id: "1" } as never);
    expect(() => decodeTestAuthCookie(signedButIncomplete)).toThrow("Invalid test auth cookie");
  });

  it("refuses to sign without a strong secret", () => {
    process.env.MARKBASE_TEST_SECRET = "short";
    expect(() =>
      encodeTestAuthCookie({ id: "1", login: "x", name: "x", accessToken: "x" }),
    ).toThrow("MARKBASE_TEST_SECRET");
  });
});

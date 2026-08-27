// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { useTestDatabase } from "../../helpers/postgres";
import { createShare } from "@/lib/shares";

describe("test reset route", () => {
  useTestDatabase();
  const testSecret = "test-secret-that-is-at-least-32-characters";

  function resetRequest(providedSecret = testSecret) {
    return new NextRequest("http://localhost/api/test/reset", {
      method: "POST",
      headers: { "x-markbase-test-secret": providedSecret },
    });
  }

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    delete env.MARKBASE_TEST_MODE;
    delete env.MARKBASE_TEST_SECRET;
    delete env.VERCEL_ENV;
  });

  it("resets test data only in test mode", async () => {
    process.env.MARKBASE_TEST_MODE = "true";
    process.env.MARKBASE_TEST_SECRET = testSecret;
    const { POST } = await import("@/app/api/test/reset/route");

    await createShare({
      type: "repo",
      ownerId: "1",
      repo: "owner-user/notes",
      branch: "main",
      filePath: null,
      accessToken: "owner-token",
      expiresIn: null,
      sharedWith: null,
      sharedWithName: null,
    });

    const response = await POST(resetRequest());
    expect(await response.json()).toEqual({ ok: true });

    process.env.MARKBASE_TEST_MODE = "false";
    const forbidden = await POST(resetRequest());
    expect(forbidden.status).toBe(404);
  });

  it("rejects reset without the matching request secret", async () => {
    process.env.MARKBASE_TEST_MODE = "true";
    process.env.MARKBASE_TEST_SECRET = testSecret;
    const { POST } = await import("@/app/api/test/reset/route");

    expect((await POST(resetRequest("wrong-secret"))).status).toBe(404);
    expect(
      (await POST(new NextRequest("http://localhost/api/test/reset", { method: "POST" }))).status,
    ).toBe(404);
  });

  it("hard-rejects reset in a production runtime even when test mode is set", async () => {
    process.env.MARKBASE_TEST_MODE = "true";
    process.env.MARKBASE_TEST_SECRET = testSecret;
    process.env.VERCEL_ENV = "production";
    const { POST } = await import("@/app/api/test/reset/route");

    const response = await POST(resetRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});

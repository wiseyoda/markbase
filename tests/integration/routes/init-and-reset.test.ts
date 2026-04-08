// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../../helpers/postgres";
import { createShare } from "@/lib/shares";

describe("init and reset routes", () => {
  useTestDatabase();

  it("initializes the database", async () => {
    const { GET } = await import("@/app/api/init-db/route");
    const response = await GET();

    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns generic error from init-db without leaking details", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      initDb: vi.fn().mockRejectedValue(new Error("boom")),
    }));

    const { GET } = await import("@/app/api/init-db/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Database initialization failed");
    expect(body).not.toHaveProperty("url_host");
    vi.doUnmock("@/lib/db");
  });

  it("resets test data only in test mode", async () => {
    process.env.MARKBASE_TEST_MODE = "true";
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

    const response = await POST();
    expect(await response.json()).toEqual({ ok: true });

    process.env.MARKBASE_TEST_MODE = "false";
    const forbidden = await POST();
    expect(forbidden.status).toBe(404);
  });
});

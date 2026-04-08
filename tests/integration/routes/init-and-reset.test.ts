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

  it("returns redacted errors from init-db", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      initDb: vi.fn().mockRejectedValue(new Error("boom")),
    }));
    delete process.env.PRISMA_DATABASE_URL;
    process.env.POSTGRES_URL = "postgresql://user:pass@example.com:5432/markbase";

    const { GET } = await import("@/app/api/init-db/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.url_host).toBe("postgresql://***@example.com:5432/markbase");
    vi.doUnmock("@/lib/db");
  });

  it("uses a fallback URL label when no database URL is configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      initDb: vi.fn().mockRejectedValue(new Error("boom")),
    }));
    delete process.env.POSTGRES_URL;
    delete process.env.PRISMA_DATABASE_URL;

    const { GET } = await import("@/app/api/init-db/route");
    const response = await GET();

    expect((await response.json()).url_host).toBe("(none)");
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

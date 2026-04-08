// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

describe("db config", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const env = process.env as Record<string, string | undefined>;
    delete env.POSTGRES_URL;
    delete env.POSTGRES_SSL;
    delete env.NODE_ENV;
  });

  it("uses required SSL by default and disables it in test mode", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("postgres", () => ({
      default: postgresMock,
    }));
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    let dbModule = await import("@/lib/db");
    dbModule.getDb();
    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://example.com/markbase",
      expect.objectContaining({ ssl: "require" }),
    );

    await dbModule.resetDb();

    vi.resetModules();
    vi.doMock("postgres", () => ({
      default: postgresMock,
    }));
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    dbModule = await import("@/lib/db");
    dbModule.getDb();

    expect(postgresMock).toHaveBeenLastCalledWith(
      "postgres://example.com/markbase",
      expect.objectContaining({ ssl: false }),
    );
  });

  it("disables SSL explicitly when configured", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("postgres", () => ({
      default: postgresMock,
    }));
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    process.env.POSTGRES_SSL = "disable";

    const dbModule = await import("@/lib/db");
    dbModule.getDb();

    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://example.com/markbase",
      expect.objectContaining({ ssl: false }),
    );
  });
});

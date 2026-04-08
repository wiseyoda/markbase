// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

describe("db config", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const env = process.env as Record<string, string | undefined>;
    delete env.POSTGRES_URL;
    delete env.PRISMA_DATABASE_URL;
    delete env.POSTGRES_SSL;
    delete env.POSTGRES_POOL_MAX;
    delete env.NODE_ENV;
    delete env.VERCEL;
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

  it("rejects prisma:// scheme URLs", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.PRISMA_DATABASE_URL = "prisma://accelerate.prisma-data.net/?api_key=abc";

    const dbModule = await import("@/lib/db");
    expect(() => dbModule.getDb()).toThrow("prisma:// scheme");
  });

  it("rejects malformed URLs", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.POSTGRES_URL = "not-a-url";

    const dbModule = await import("@/lib/db");
    expect(() => dbModule.getDb()).toThrow("Invalid database URL");
  });

  it("rejects URLs with no hostname", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.POSTGRES_URL = "postgres:///markbase";

    const dbModule = await import("@/lib/db");
    expect(() => dbModule.getDb()).toThrow("no hostname");
  });

  it("defaults pool max to 1 on Vercel, 3 locally", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    process.env.VERCEL = "1";

    let dbModule = await import("@/lib/db");
    dbModule.getDb();
    expect(postgresMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 1 }),
    );

    await dbModule.resetDb();
    vi.resetModules();
    vi.doMock("postgres", () => ({ default: postgresMock }));
    delete (process.env as Record<string, string | undefined>).VERCEL;
    dbModule = await import("@/lib/db");
    dbModule.getDb();
    expect(postgresMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 3 }),
    );
  });

  it("falls back to 1 when POSTGRES_POOL_MAX is invalid", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    process.env.POSTGRES_POOL_MAX = "not-a-number";

    const dbModule = await import("@/lib/db");
    dbModule.getDb();
    expect(postgresMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 1 }),
    );
    await dbModule.resetDb();

    vi.resetModules();
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.POSTGRES_POOL_MAX = "-5";
    const dbModule2 = await import("@/lib/db");
    dbModule2.getDb();
    expect(postgresMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 1 }),
    );
  });

  it("respects valid POSTGRES_POOL_MAX", async () => {
    const postgresMock = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("postgres", () => ({ default: postgresMock }));
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    process.env.POSTGRES_POOL_MAX = "10";

    const dbModule = await import("@/lib/db");
    dbModule.getDb();
    expect(postgresMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 10 }),
    );
  });

  it("identifies transient connection errors", async () => {
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    vi.doMock("postgres", () => ({
      default: vi.fn(() => ({ end: vi.fn().mockResolvedValue(undefined) })),
    }));

    const { isTransientDbError } = await import("@/lib/db");
    expect(isTransientDbError({ code: "CONNECT_TIMEOUT" })).toBe(true);
    expect(isTransientDbError({ code: "CONNECTION_CLOSED" })).toBe(true);
    expect(isTransientDbError({ code: "42P01" })).toBe(false);
    expect(isTransientDbError(new Error("random"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });

  it("retries on transient errors and resets the pool", async () => {
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    const endMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("postgres", () => ({
      default: vi.fn(() => ({ end: endMock })),
    }));

    const { withDbRetry, getDb, resetDb } = await import("@/lib/db");
    // Initialize the pool so resetDb has something to close
    getDb();

    let calls = 0;
    const result = await withDbRetry(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error("timeout") as Error & { code: string };
        err.code = "CONNECT_TIMEOUT";
        throw err;
      }
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(endMock).toHaveBeenCalled();
    await resetDb();
  });

  it("does not retry non-transient errors", async () => {
    process.env.POSTGRES_URL = "postgres://example.com/markbase";
    vi.doMock("postgres", () => ({
      default: vi.fn(() => ({ end: vi.fn().mockResolvedValue(undefined) })),
    }));

    const { withDbRetry } = await import("@/lib/db");

    await expect(
      withDbRetry(async () => {
        throw new Error("syntax error");
      }),
    ).rejects.toThrow("syntax error");
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

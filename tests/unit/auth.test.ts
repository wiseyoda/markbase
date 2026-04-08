// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeTestAuthCookie } from "@/lib/test-auth";

interface AuthConfig {
  callbacks: {
    jwt: (args: {
      token: Record<string, unknown>;
      account: { access_token: string } | null;
      profile:
        | {
            id: number;
            login: string | undefined;
            name: string | null;
            avatar_url: string | null;
          }
        | null;
    }) => Promise<Record<string, unknown>>;
    session: (args: {
      session: { user?: Record<string, unknown> };
      token: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
  };
}

const nextAuthMock = vi.fn();
const cookiesMock = vi.fn();

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("next-auth/providers/github", () => ({
  default: vi.fn((config) => config),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

describe("auth", () => {
  beforeEach(() => {
    vi.resetModules();
    nextAuthMock.mockReset();
    cookiesMock.mockReset();
    const env = process.env as Record<string, string | undefined>;
    delete env.AUTH_BYPASS;
    delete env.GITHUB_PAT;
    delete env.GITHUB_BYPASS_USER_ID;
    delete env.GITHUB_BYPASS_LOGIN;
    delete env.NODE_ENV;
    delete env.MARKBASE_TEST_MODE;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the injected test session cookie in test mode", async () => {
    nextAuthMock.mockReturnValue({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn().mockResolvedValue(null),
    });
    cookiesMock.mockResolvedValue({
      get: () => ({
        value: encodeTestAuthCookie({
          id: "1",
          login: "owner-user",
          name: "Owner User",
          accessToken: "owner-token",
        }),
      }),
    });
    process.env.MARKBASE_TEST_MODE = "true";

    const { auth } = await import("@/auth");

    await expect(auth()).resolves.toMatchObject({
      accessToken: "owner-token",
      user: {
        id: "1",
        login: "owner-user",
        name: "Owner User",
      },
    });
  });

  it("falls back to the bypass session when enabled", async () => {
    nextAuthMock.mockReturnValue({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn(),
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });
    process.env.AUTH_BYPASS = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.GITHUB_PAT = "owner-token";
    process.env.GITHUB_BYPASS_USER_ID = "1";
    process.env.GITHUB_BYPASS_LOGIN = "owner-user";

    const { auth } = await import("@/auth");

    await expect(auth()).resolves.toMatchObject({
      accessToken: "owner-token",
      user: {
        id: "1",
        login: "owner-user",
        name: "Dev User",
      },
    });
  });

  it("throws when bypass is enabled without a PAT", async () => {
    nextAuthMock.mockReturnValue({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn(),
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });
    process.env.AUTH_BYPASS = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";

    const { auth } = await import("@/auth");

    await expect(auth()).rejects.toThrow(
      "AUTH_BYPASS requires GITHUB_PAT in .env.local",
    );
  });

  it("delegates to NextAuth by default", async () => {
    const nextAuthHandler = vi.fn().mockResolvedValue({ user: { id: "1" } });
    nextAuthMock.mockReturnValue({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: nextAuthHandler,
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });

    const { auth } = await import("@/auth");

    await expect(auth()).resolves.toEqual({ user: { id: "1" } });
    expect(nextAuthHandler).toHaveBeenCalled();
  });

  it("runs jwt and session callbacks", async () => {
    const upsertUserMock = vi.fn().mockResolvedValue(undefined);
    let capturedConfig!: AuthConfig;

    vi.doMock("@/lib/users", () => ({
      upsertUser: upsertUserMock,
    }));
    nextAuthMock.mockImplementation((config) => {
      capturedConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn().mockResolvedValue(null),
      };
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });

    await import("@/auth");

    const token = await capturedConfig.callbacks.jwt({
      token: {},
      account: { access_token: "owner-token" },
      profile: {
        id: 1,
        login: "owner-user",
        name: "Owner User",
        avatar_url: "https://example.com/owner.png",
      },
    });

    expect(token).toEqual({
      accessToken: "owner-token",
      userId: "1",
      userLogin: "owner-user",
    });
    expect(upsertUserMock).toHaveBeenCalledWith({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
    });

    const session = await capturedConfig.callbacks.session({
      session: { user: {} },
      token: {
        accessToken: "owner-token",
        userId: "1",
        userLogin: "owner-user",
      },
    });

    expect(session).toEqual({
      user: {
        id: "1",
        login: "owner-user",
      },
      accessToken: "owner-token",
    });

    await expect(
      capturedConfig.callbacks.jwt({
        token: {},
        account: { access_token: "owner-token" },
        profile: null,
      }),
    ).resolves.toEqual({
      accessToken: "owner-token",
    });
  });

  it("ignores invalid cookies and user upsert failures", async () => {
    const upsertUserMock = vi.fn().mockRejectedValue(new Error("db down"));
    let capturedConfig!: AuthConfig;
    const nextAuthHandler = vi.fn().mockResolvedValue({ ok: true });

    vi.doMock("@/lib/users", () => ({
      upsertUser: upsertUserMock,
    }));
    nextAuthMock.mockImplementation((config) => {
      capturedConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: nextAuthHandler,
      };
    });
    cookiesMock.mockResolvedValue({
      get: () => ({ value: "bad-cookie" }),
    });
    process.env.MARKBASE_TEST_MODE = "true";

    const { auth } = await import("@/auth");

    await expect(
      capturedConfig.callbacks.jwt({
        token: {},
        account: null,
        profile: {
          id: 1,
          login: "owner-user",
          name: null,
          avatar_url: null,
        },
      }),
    ).resolves.toEqual({
      userId: "1",
      userLogin: "owner-user",
    });
    await expect(auth()).resolves.toBeNull();
  });

  it("falls through when test mode has no cookie and uses test-mode bypass defaults", async () => {
    const nextAuthHandler = vi.fn().mockResolvedValue({ ok: true });
    nextAuthMock.mockReturnValue({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: nextAuthHandler,
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });
    process.env.MARKBASE_TEST_MODE = "true";

    let mod = await import("@/auth");
    await expect(mod.auth()).resolves.toBeNull();

    vi.resetModules();
    nextAuthMock.mockReturnValue({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn(),
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });
    process.env.AUTH_BYPASS = "true";
    process.env.MARKBASE_TEST_MODE = "true";
    process.env.GITHUB_PAT = "owner-token";

    mod = await import("@/auth");
    await expect(mod.auth()).resolves.toBeNull();
  });

  it("leaves sessions without a user object unchanged", async () => {
    let capturedConfig!: AuthConfig;

    nextAuthMock.mockImplementation((config) => {
      capturedConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn().mockResolvedValue(null),
      };
    });
    cookiesMock.mockResolvedValue({ get: () => undefined });

    await import("@/auth");

    const session = await capturedConfig.callbacks.session({
      session: {},
      token: { accessToken: "owner-token", sub: "1" },
    });

    expect(session).toEqual({
      accessToken: "owner-token",
    });
  });
});

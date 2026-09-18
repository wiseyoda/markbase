// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

type SqlCall = { text: string; values: unknown[] };

const { sqlMock, calls, results } = vi.hoisted(() => {
  const calls: SqlCall[] = [];
  const results: unknown[][] = [];
  const sqlMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });
    return results.shift() ?? [];
  });
  return { sqlMock, calls, results };
});

vi.mock("@/lib/db", () => ({
  getDb: () => sqlMock,
  withDbRetry: (operation: () => Promise<unknown>) => operation(),
}));

import {
  DEVICE_CODE_TTL_MS,
  DEVICE_POLL_INTERVAL_SECONDS,
  authorizeDevice,
  consumeDeviceCode,
  createDeviceAuthorization,
  denyDevice,
  findPendingByUserCode,
  formatUserCode,
  generateUserCode,
  normalizeUserCode,
  pollDeviceCode,
} from "@/lib/mcp/device";

describe("MCP device authorization", () => {
  beforeEach(() => {
    calls.length = 0;
    results.length = 0;
    sqlMock.mockClear();
  });

  it("formats and generates unambiguous XXXX-XXXX user codes", () => {
    expect(formatUserCode("BCDFGHJK")).toBe("BCDF-GHJK");
    for (let i = 0; i < 50; i++) {
      expect(generateUserCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    }
  });

  it("normalizes case, dashes, and whitespace on user-code input", () => {
    expect(normalizeUserCode("BCDF-GHJK")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("bcdfghjk")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("  bcdf ghjk ")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("bc-df-gh-jk")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("BCDF-GHJ")).toBeNull();
    expect(normalizeUserCode("BCDF-GHJKL")).toBeNull();
    expect(normalizeUserCode("ABCD-EFGH")).toBeNull();
    expect(normalizeUserCode("")).toBeNull();
  });

  it("stores a digest of the device code with a 15 minute TTL", async () => {
    const before = Date.now();
    const authorization = await createDeviceAuthorization("client-1");

    expect(authorization.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(authorization.interval).toBe(DEVICE_POLL_INTERVAL_SECONDS);
    expect(authorization.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      DEVICE_CODE_TTL_MS - 50,
    );
    expect(authorization.expiresAt.getTime() - before).toBeLessThanOrEqual(
      DEVICE_CODE_TTL_MS + 50,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("INSERT INTO mcp_device_codes");
    const [digest, userCode, clientId, expiresAt] = calls[0].values;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(authorization.deviceCode);
    expect(userCode).toBe(authorization.userCode);
    expect(clientId).toBe("client-1");
    expect(expiresAt).toBe(authorization.expiresAt);
  });

  it("looks up pending requests by normalized user code", async () => {
    await expect(findPendingByUserCode("nope")).resolves.toBeNull();
    expect(sqlMock).not.toHaveBeenCalled();

    await expect(findPendingByUserCode("bcdfghjk")).resolves.toBeNull();
    expect(calls[0].text).toContain("status = 'pending'");
    expect(calls[0].values).toEqual(["BCDF-GHJK"]);

    const expiresAt = new Date(Date.now() + 60_000);
    results.push([
      {
        user_code: "BCDF-GHJK",
        client_id: "client-1",
        status: "pending",
        expires_at: expiresAt,
      },
    ]);
    await expect(findPendingByUserCode("BCDF GHJK")).resolves.toEqual({
      userCode: "BCDF-GHJK",
      clientId: "client-1",
      status: "pending",
      expiresAt,
    });
  });

  it("settles pending requests atomically as authorized or denied", async () => {
    await expect(authorizeDevice("bad", "code")).resolves.toBe(false);
    await expect(denyDevice("bad")).resolves.toBe(false);
    expect(sqlMock).not.toHaveBeenCalled();

    results.push([{ user_code: "BCDF-GHJK" }]);
    await expect(authorizeDevice("bcdf-ghjk", "encoded-code")).resolves.toBe(true);
    expect(calls[0].text).toContain("UPDATE mcp_device_codes");
    expect(calls[0].text).toContain("status = 'pending'");
    expect(calls[0].values).toEqual(["authorized", "encoded-code", "BCDF-GHJK"]);

    await expect(authorizeDevice("BCDF-GHJK", "encoded-code")).resolves.toBe(false);

    results.push([{ user_code: "BCDF-GHJK" }]);
    await expect(denyDevice("BCDF-GHJK")).resolves.toBe(true);
    expect(calls[2].values).toEqual(["denied", null, "BCDF-GHJK"]);
  });

  it("consumes an authorized device code exactly once", async () => {
    results.push([{ auth_code: "encoded-code" }]);
    await expect(consumeDeviceCode("device-code")).resolves.toBe("encoded-code");
    expect(calls[0].text).toContain("status = 'authorized'");
    expect(calls[0].values[0]).toMatch(/^[0-9a-f]{64}$/);

    await expect(consumeDeviceCode("device-code")).resolves.toBeNull();
    results.push([{ auth_code: null }]);
    await expect(consumeDeviceCode("device-code")).resolves.toBeNull();
  });

  it("reports poll state and enforces the polling interval", async () => {
    await expect(pollDeviceCode("device-code")).resolves.toEqual({ status: "unknown" });
    expect(calls[0].text).toContain("SET last_polled_at = NOW()");
    expect(calls[0].values[0]).toBe(DEVICE_POLL_INTERVAL_SECONDS * 1000);

    const row = (overrides: Record<string, unknown>) => [
      { status: "pending", auth_code: null, expired: false, too_fast: false, ...overrides },
    ];
    results.push(row({}));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({ status: "pending" });
    results.push(row({ too_fast: true }));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({ status: "slow_down" });
    results.push(row({ expired: true, status: "authorized" }));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({ status: "expired" });
    results.push(row({ status: "denied" }));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({ status: "denied" });
    results.push(row({ status: "authorized", auth_code: "encoded", too_fast: true }));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({
      status: "authorized",
      authCode: "encoded",
    });
    results.push(row({ status: "authorized", auth_code: null }));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({
      status: "authorized",
      authCode: "",
    });
    results.push(row({ status: "consumed", expired: true }));
    await expect(pollDeviceCode("device-code")).resolves.toEqual({ status: "unknown" });
  });
});

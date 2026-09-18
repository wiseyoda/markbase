// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  DEVICE_POLL_INTERVAL_SECONDS,
  authorizeDevice,
  consumeDeviceCode,
  createDeviceAuthorization,
  denyDevice,
  findPendingByUserCode,
  pollDeviceCode,
} from "@/lib/mcp/device";
import { getDb } from "@/lib/db";
import { useTestDatabase } from "../../helpers/postgres";

async function backdatePoll(userCode: string) {
  await getDb()`
    UPDATE mcp_device_codes
    SET last_polled_at = NOW() - (${(DEVICE_POLL_INTERVAL_SECONDS + 1) * 1000} * INTERVAL '1 millisecond')
    WHERE user_code = ${userCode}
  `;
}

async function expire(userCode: string) {
  await getDb()`
    UPDATE mcp_device_codes
    SET expires_at = NOW() - INTERVAL '1 second'
    WHERE user_code = ${userCode}
  `;
}

describe("MCP device codes", () => {
  useTestDatabase();

  it("stores only a digest and resolves pending requests by normalized user code", async () => {
    const authorization = await createDeviceAuthorization("client-1");

    const [stored] = await getDb()<{
      device_code_digest: string;
      status: string;
      expires_at: Date;
    }[]>`
      SELECT device_code_digest, status, expires_at
      FROM mcp_device_codes WHERE user_code = ${authorization.userCode}
    `;
    expect(stored.device_code_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.device_code_digest).not.toBe(authorization.deviceCode);
    expect(stored.status).toBe("pending");
    expect(stored.expires_at.getTime()).toBeCloseTo(
      authorization.expiresAt.getTime(),
      -3,
    );

    const lowered = authorization.userCode.toLowerCase().replace("-", " ");
    await expect(findPendingByUserCode(lowered)).resolves.toMatchObject({
      userCode: authorization.userCode,
      clientId: "client-1",
      status: "pending",
    });
    await expect(findPendingByUserCode("BCDF-GHJK")).resolves.toBeNull();
    await expect(findPendingByUserCode("nonsense")).resolves.toBeNull();
  });

  it("moves a pending request through authorized and consumed exactly once", async () => {
    const authorization = await createDeviceAuthorization("client-1");

    await expect(pollDeviceCode(authorization.deviceCode)).resolves.toEqual({
      status: "pending",
    });
    await expect(pollDeviceCode(authorization.deviceCode)).resolves.toEqual({
      status: "slow_down",
    });
    await backdatePoll(authorization.userCode);
    await expect(pollDeviceCode(authorization.deviceCode)).resolves.toEqual({
      status: "pending",
    });

    await expect(consumeDeviceCode(authorization.deviceCode)).resolves.toBeNull();
    await expect(
      authorizeDevice(authorization.userCode, "encoded-auth-code"),
    ).resolves.toBe(true);
    await expect(
      authorizeDevice(authorization.userCode, "another-code"),
    ).resolves.toBe(false);
    await expect(denyDevice(authorization.userCode)).resolves.toBe(false);
    await expect(findPendingByUserCode(authorization.userCode)).resolves.toBeNull();

    // Authorized results are not rate limited so the client gets its tokens promptly.
    await expect(pollDeviceCode(authorization.deviceCode)).resolves.toEqual({
      status: "authorized",
      authCode: "encoded-auth-code",
    });
    await expect(consumeDeviceCode(authorization.deviceCode)).resolves.toBe(
      "encoded-auth-code",
    );
    await expect(consumeDeviceCode(authorization.deviceCode)).resolves.toBeNull();
    await expect(pollDeviceCode(authorization.deviceCode)).resolves.toEqual({
      status: "unknown",
    });
  });

  it("reports denied, expired, and unknown device codes", async () => {
    const denied = await createDeviceAuthorization("client-1");
    await expect(denyDevice(denied.userCode)).resolves.toBe(true);
    await expect(pollDeviceCode(denied.deviceCode)).resolves.toEqual({
      status: "denied",
    });
    await expect(authorizeDevice(denied.userCode, "code")).resolves.toBe(false);

    const expired = await createDeviceAuthorization("client-1");
    await expire(expired.userCode);
    await expect(findPendingByUserCode(expired.userCode)).resolves.toBeNull();
    await expect(authorizeDevice(expired.userCode, "code")).resolves.toBe(false);
    await expect(pollDeviceCode(expired.deviceCode)).resolves.toEqual({
      status: "expired",
    });

    const authorizedThenExpired = await createDeviceAuthorization("client-1");
    await expect(
      authorizeDevice(authorizedThenExpired.userCode, "code"),
    ).resolves.toBe(true);
    await expire(authorizedThenExpired.userCode);
    await expect(
      consumeDeviceCode(authorizedThenExpired.deviceCode),
    ).resolves.toBeNull();
    await expect(
      pollDeviceCode(authorizedThenExpired.deviceCode),
    ).resolves.toEqual({ status: "expired" });

    await expect(pollDeviceCode("never-issued")).resolves.toEqual({
      status: "unknown",
    });
  });
});

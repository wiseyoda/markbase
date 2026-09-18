import { createHash, randomBytes, randomInt } from "node:crypto";
import { getDb, withDbRetry } from "@/lib/db";

/** Lifetime of a device authorization request (RFC 8628 `expires_in`). */
export const DEVICE_CODE_TTL_MS = 15 * 60 * 1000;
/** Minimum seconds between token-endpoint polls (RFC 8628 `interval`). */
export const DEVICE_POLL_INTERVAL_SECONDS = 5;

/** Unambiguous alphabet: no vowels (avoids words) and no 0/O/1/I/Y look-alikes. */
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const USER_CODE_LENGTH = 8;
const USER_CODE_PATTERN = new RegExp(`^[${USER_CODE_ALPHABET}]{${USER_CODE_LENGTH}}$`);

export type DeviceCodeStatus = "pending" | "authorized" | "denied" | "consumed";

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  expiresAt: Date;
  interval: number;
}

export interface DeviceCodeRecord {
  userCode: string;
  clientId: string;
  status: DeviceCodeStatus;
  expiresAt: Date;
}

export type DevicePollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "authorized"; authCode: string }
  | { status: "unknown" };

interface DeviceCodeRow {
  user_code: string;
  client_id: string;
  status: DeviceCodeStatus;
  expires_at: Date;
}

interface DevicePollRow {
  status: DeviceCodeStatus;
  auth_code: string | null;
  expired: boolean;
  too_fast: boolean;
}

function digest(deviceCode: string): string {
  return createHash("sha256").update(deviceCode).digest("hex");
}

/** Render an 8-character code as `XXXX-XXXX`. */
export function formatUserCode(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/**
 * Canonicalize user input to the stored `XXXX-XXXX` form: case-insensitive,
 * ignoring dashes and whitespace. Returns null when the input cannot be a
 * valid code, so callers skip the database round-trip.
 */
export function normalizeUserCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  if (!USER_CODE_PATTERN.test(compact)) return null;
  return formatUserCode(compact);
}

export function generateUserCode(): string {
  let compact = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    compact += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return formatUserCode(compact);
}

export async function createDeviceAuthorization(
  clientId: string,
): Promise<DeviceAuthorization> {
  const deviceCode = randomBytes(32).toString("base64url");
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

  await withDbRetry(() => getDb()`
    INSERT INTO mcp_device_codes (
      device_code_digest, user_code, client_id, status, expires_at
    )
    VALUES (${digest(deviceCode)}, ${userCode}, ${clientId}, 'pending', ${expiresAt})
  `);

  return {
    deviceCode,
    userCode,
    expiresAt,
    interval: DEVICE_POLL_INTERVAL_SECONDS,
  };
}

export async function findPendingByUserCode(
  input: string,
): Promise<DeviceCodeRecord | null> {
  const userCode = normalizeUserCode(input);
  if (!userCode) return null;

  const rows = await withDbRetry(() => getDb()<DeviceCodeRow[]>`
    SELECT user_code, client_id, status, expires_at
    FROM mcp_device_codes
    WHERE user_code = ${userCode}
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    userCode: row.user_code,
    clientId: row.client_id,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

async function settlePending(
  input: string,
  status: "authorized" | "denied",
  authCode: string | null,
): Promise<boolean> {
  const userCode = normalizeUserCode(input);
  if (!userCode) return false;

  const rows = await withDbRetry(() => getDb()`
    UPDATE mcp_device_codes
    SET status = ${status}, auth_code = ${authCode}
    WHERE user_code = ${userCode}
      AND status = 'pending'
      AND expires_at > NOW()
    RETURNING user_code
  `);
  return rows.length === 1;
}

/** Atomically move a pending request to `authorized`, attaching the auth code. */
export function authorizeDevice(
  userCode: string,
  encodedAuthCode: string,
): Promise<boolean> {
  return settlePending(userCode, "authorized", encodedAuthCode);
}

/** Atomically move a pending request to `denied`. */
export function denyDevice(userCode: string): Promise<boolean> {
  return settlePending(userCode, "denied", null);
}

/**
 * Single-use hand-off of the stored auth code: only an `authorized`,
 * unexpired request yields it, and it is marked `consumed` in the same statement.
 */
export async function consumeDeviceCode(
  deviceCode: string,
): Promise<string | null> {
  const rows = await withDbRetry(() => getDb()<{ auth_code: string | null }[]>`
    UPDATE mcp_device_codes
    SET status = 'consumed'
    WHERE device_code_digest = ${digest(deviceCode)}
      AND status = 'authorized'
      AND expires_at > NOW()
    RETURNING auth_code
  `);
  return rows[0]?.auth_code ?? null;
}

/**
 * Report the request state for a token-endpoint poll and stamp
 * `last_polled_at`. Polling faster than the advertised interval while the
 * request is still pending yields `slow_down` (RFC 8628 section 3.5).
 */
export async function pollDeviceCode(
  deviceCode: string,
): Promise<DevicePollResult> {
  const codeDigest = digest(deviceCode);
  const intervalMs = DEVICE_POLL_INTERVAL_SECONDS * 1000;
  // Both CTEs share one snapshot: `previous` reads the pre-poll timestamp
  // while `stamped` records this poll.
  const rows = await withDbRetry(() => getDb()<DevicePollRow[]>`
    WITH previous AS (
      SELECT status, auth_code,
             expires_at <= NOW() AS expired,
             (
               last_polled_at IS NOT NULL
               AND last_polled_at > NOW() - (${intervalMs} * INTERVAL '1 millisecond')
             ) AS too_fast
      FROM mcp_device_codes
      WHERE device_code_digest = ${codeDigest}
    ), stamped AS (
      UPDATE mcp_device_codes
      SET last_polled_at = NOW()
      WHERE device_code_digest = ${codeDigest}
      RETURNING device_code_digest
    )
    SELECT status, auth_code, expired, too_fast FROM previous
  `);
  const row = rows[0];
  if (!row || row.status === "consumed") return { status: "unknown" };
  if (row.expired) return { status: "expired" };
  if (row.status === "denied") return { status: "denied" };
  if (row.status === "authorized") {
    return { status: "authorized", authCode: row.auth_code ?? "" };
  }
  return { status: row.too_fast ? "slow_down" : "pending" };
}

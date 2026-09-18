// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCP_ROTATION_GRACE_MS,
  consumeMcpAuthorizationCode,
  createMcpGrant,
  getMcpGrant,
  revokeMcpGrant,
  rotateMcpGrant,
} from "@/lib/mcp/grants";
import { useTestDatabase } from "../../helpers/postgres";
import { getDb } from "@/lib/db";

describe("MCP grants", () => {
  useTestDatabase();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores GitHub tokens server-side and supports atomic rotation/revocation", async () => {
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "github-secret-token",
    });

    await expect(getMcpGrant(grant.id, 1)).resolves.toMatchObject({
      githubToken: "github-secret-token",
      tokenVersion: 1,
    });
    const rotated = await rotateMcpGrant(grant.id, 1);
    expect(rotated?.tokenVersion).toBe(2);
    // Inside the grace window the previous version still resolves: a raced
    // refresh receives the current pair without a second bump, and the
    // previous access token keeps working.
    await expect(rotateMcpGrant(grant.id, 1)).resolves.toMatchObject({
      tokenVersion: 2,
    });
    await expect(getMcpGrant(grant.id, 1)).resolves.toMatchObject({
      tokenVersion: 2,
    });
    await expect(getMcpGrant(grant.id, 2)).resolves.toMatchObject({
      tokenVersion: 2,
    });
    // Versions older than the immediately previous one never resolve.
    await expect(getMcpGrant(grant.id, 0)).resolves.toBeNull();
    await expect(rotateMcpGrant(grant.id, 0)).resolves.toBeNull();

    await expect(revokeMcpGrant(grant.id)).resolves.toBe(true);
    await expect(getMcpGrant(grant.id, 2)).resolves.toBeNull();
    await expect(getMcpGrant(grant.id, 1)).resolves.toBeNull();
    await expect(rotateMcpGrant(grant.id, 1)).resolves.toBeNull();
    await expect(revokeMcpGrant(grant.id)).resolves.toBe(false);
  });

  it("rejects the previous token version once the rotation grace has elapsed", async () => {
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "github-secret-token",
    });
    await expect(rotateMcpGrant(grant.id, 1)).resolves.toMatchObject({
      tokenVersion: 2,
    });

    await getDb()`
      UPDATE mcp_grants
      SET token_rotated_at = NOW() - (${MCP_ROTATION_GRACE_MS + 1_000} * INTERVAL '1 millisecond')
      WHERE id = ${grant.id}
    `;

    await expect(rotateMcpGrant(grant.id, 1)).resolves.toBeNull();
    await expect(getMcpGrant(grant.id, 1)).resolves.toBeNull();
    await expect(getMcpGrant(grant.id, 2)).resolves.toMatchObject({
      tokenVersion: 2,
    });
    // The current version rotates normally afterwards.
    await expect(rotateMcpGrant(grant.id, 2)).resolves.toMatchObject({
      tokenVersion: 3,
    });
  });

  it("refreshes an expiring GitHub credential for a token inside the rotation grace", async () => {
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expiring-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
      githubRefreshToken: "current-refresh-token",
      githubRefreshTokenExpiresAt: Date.now() + 60_000,
    });
    await getDb()`
      UPDATE mcp_grants
      SET token_version = 2, token_rotated_at = NOW()
      WHERE id = ${grant.id}
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "refreshed-access-token",
          expires_in: 28_800,
        }),
      }),
    );

    await expect(getMcpGrant(grant.id, 1)).resolves.toMatchObject({
      githubToken: "refreshed-access-token",
      tokenVersion: 2,
    });
  });

  it("consumes authorization codes exactly once", async () => {
    await expect(consumeMcpAuthorizationCode("code-1")).resolves.toBe(true);
    await expect(consumeMcpAuthorizationCode("code-1")).resolves.toBe(false);
    await expect(consumeMcpAuthorizationCode("code-2")).resolves.toBe(true);
  });

  it("propagates a newly authorized GitHub credential to active grants", async () => {
    const first = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "old-access-token",
    });

    const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const accessExpiresAt = Date.now() + 8 * 60 * 60 * 1000;
    await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "new-access-token",
      githubTokenExpiresAt: accessExpiresAt,
      githubRefreshToken: "new-refresh-token",
      githubRefreshTokenExpiresAt: refreshExpiresAt,
    });

    await expect(getMcpGrant(first.id, 1)).resolves.toMatchObject({
      githubToken: "new-access-token",
    });

    const [stored] = await getDb()<{
      github_token: string;
      github_refresh_token: string;
      github_token_expires_at: Date;
      github_refresh_token_expires_at: Date;
    }[]>`
      SELECT github_token, github_refresh_token, github_token_expires_at,
             github_refresh_token_expires_at
      FROM mcp_grants WHERE id = ${first.id}
    `;
    expect(stored.github_token).not.toContain("new-access-token");
    expect(stored.github_refresh_token).not.toContain("new-refresh-token");
    expect(stored.github_token_expires_at.getTime()).toBeCloseTo(accessExpiresAt, -2);
    expect(stored.github_refresh_token_expires_at.getTime()).toBeCloseTo(
      refreshExpiresAt,
      -2,
    );
  });

  it("refreshes an expiring GitHub credential once across concurrent reads", async () => {
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expiring-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
      githubRefreshToken: "current-refresh-token",
      githubRefreshTokenExpiresAt: Date.now() + 60_000,
    });
    const siblingGrant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expiring-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
      githubRefreshToken: "current-refresh-token",
      githubRefreshTokenExpiresAt: Date.now() + 60_000,
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        ok: true,
        json: async () => ({
          access_token: "refreshed-access-token",
          expires_in: 28_800,
          refresh_token: "rotated-refresh-token",
          refresh_token_expires_in: 15_552_000,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      getMcpGrant(grant.id, 1),
      getMcpGrant(siblingGrant.id, 1),
    ]);

    expect(first?.githubToken).toBe("refreshed-access-token");
    expect(second?.githubToken).toBe("refreshed-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("client_id")).toBe("test-github-id");
    expect(body.get("client_secret")).toBe("test-github-secret");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("current-refresh-token");
  });

  it("keeps a newer authorization when an older refresh finishes later", async () => {
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expired-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
      githubRefreshToken: "old-refresh-token",
      githubRefreshTokenExpiresAt: Date.now() + 60_000,
    });
    let finishRefresh!: () => void;
    const refreshBlocked = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      await refreshBlocked;
      return {
        ok: true,
        json: async () => ({
          access_token: "older-lineage-access-token",
          expires_in: 28_800,
          refresh_token: "older-lineage-refresh-token",
          refresh_token_expires_in: 15_552_000,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const refreshing = getMcpGrant(grant.id, 1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "new-authorization-token",
    });
    finishRefresh();

    await expect(refreshing).resolves.toMatchObject({
      githubToken: "new-authorization-token",
    });
    await expect(getMcpGrant(grant.id, 1)).resolves.toMatchObject({
      githubToken: "new-authorization-token",
    });
  });

  it("preserves non-expiring OAuth credentials without refreshing", async () => {
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "classic-oauth-token",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMcpGrant(grant.id, 1)).resolves.toMatchObject({
      githubToken: "classic-oauth-token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an expired credential without a usable refresh token", async () => {
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expired-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
    });

    await expect(getMcpGrant(grant.id, 1)).rejects.toThrow(
      "GitHub credential expired and cannot be refreshed",
    );
  });

  it("fails closed when OAuth configuration or refresh exchange fails", async () => {
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expired-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
      githubRefreshToken: "refresh-token",
      githubRefreshTokenExpiresAt: Date.now() + 60_000,
    });
    delete process.env.GITHUB_ID;
    delete process.env.GITHUB_SECRET;
    await expect(getMcpGrant(grant.id, 1)).rejects.toThrow(
      "GitHub OAuth credentials are not configured",
    );

    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    await expect(getMcpGrant(grant.id, 1)).rejects.toThrow(
      "Failed to refresh GitHub credential",
    );
  });

  it("accepts a refresh response without optional rotation metadata", async () => {
    process.env.GITHUB_ID = "test-github-id";
    process.env.GITHUB_SECRET = "test-github-secret";
    const grant = await createMcpGrant({
      userId: "101",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
      githubToken: "expired-access-token",
      githubTokenExpiresAt: Date.now() - 1_000,
      githubRefreshToken: "refresh-token",
      githubRefreshTokenExpiresAt: Date.now() + 60_000,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "non-expiring-access-token" }),
      }),
    );

    await expect(getMcpGrant(grant.id, 1)).resolves.toMatchObject({
      githubToken: "non-expiring-access-token",
    });
  });
});

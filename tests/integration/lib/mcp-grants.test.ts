// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  consumeMcpAuthorizationCode,
  createMcpGrant,
  getMcpGrant,
  revokeMcpGrant,
  rotateMcpGrant,
} from "@/lib/mcp/grants";
import { useTestDatabase } from "../../helpers/postgres";

describe("MCP grants", () => {
  useTestDatabase();

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
    await expect(rotateMcpGrant(grant.id, 1)).resolves.toBeNull();
    await expect(getMcpGrant(grant.id, 1)).resolves.toBeNull();
    await expect(getMcpGrant(grant.id, 2)).resolves.toMatchObject({
      tokenVersion: 2,
    });

    await expect(revokeMcpGrant(grant.id)).resolves.toBe(true);
    await expect(getMcpGrant(grant.id, 2)).resolves.toBeNull();
    await expect(revokeMcpGrant(grant.id)).resolves.toBe(false);
  });

  it("consumes authorization codes exactly once", async () => {
    await expect(consumeMcpAuthorizationCode("code-1")).resolves.toBe(true);
    await expect(consumeMcpAuthorizationCode("code-1")).resolves.toBe(false);
    await expect(consumeMcpAuthorizationCode("code-2")).resolves.toBe(true);
  });
});

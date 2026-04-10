// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  createShare,
  deleteShare,
  getShare,
  getVisitedShares,
  listShares,
  listSharesForRepo,
  listSharesWithMe,
  recordShareVisit,
} from "@/lib/shares";
import { useTestDatabase } from "../../helpers/postgres";

describe("shares", () => {
  useTestDatabase();

  it("creates, fetches, lists, and deletes shares", async () => {
    const id = await createShare({
      type: "file",
      ownerId: "1",
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      accessToken: "owner-token",
      expiresIn: "1d",
      sharedWith: "2",
      sharedWithName: "recipient-user",
    });

    const share = await getShare(id);
    expect(share).toMatchObject({
      id,
      type: "file",
      owner_id: "1",
      repo: "owner-user/notes",
      branch: "main",
      file_path: "README.md",
      shared_with: "2",
      shared_with_name: "recipient-user",
      accessToken: "owner-token",
    });
    expect(share?.expires_at).not.toBeNull();

    expect(await listSharesForRepo("1", "owner-user/notes")).toHaveLength(1);
    expect(await listSharesWithMe("2")).toHaveLength(1);
    expect(await listShares("1")).toHaveLength(1);

    await expect(deleteShare(id, "1")).resolves.toBe(true);
    await expect(getShare(id)).resolves.toBeNull();
  });

  it("records and retrieves share visits", async () => {
    // Create a public share (no shared_with)
    const shareId = await createShare({
      type: "file",
      ownerId: "1",
      repo: "owner-user/notes",
      branch: "main",
      filePath: "README.md",
      accessToken: "owner-token",
      expiresIn: "7d",
      sharedWith: null,
      sharedWithName: null,
    });

    // Visitor records a visit
    await recordShareVisit("99", shareId);

    const visited = await getVisitedShares("99");
    expect(visited).toHaveLength(1);
    expect(visited[0].id).toBe(shareId);

    // Second visit updates timestamp (upsert, no duplicate)
    await recordShareVisit("99", shareId);
    expect(await getVisitedShares("99")).toHaveLength(1);

    // Owner's own shares are excluded from visited
    await recordShareVisit("1", shareId);
    expect(await getVisitedShares("1")).toHaveLength(0);

    // Deleted shares disappear from visited
    await deleteShare(shareId, "1");
    expect(await getVisitedShares("99")).toHaveLength(0);
  });

  it("ignores unknown expiry values", async () => {
    const id = await createShare({
      type: "repo",
      ownerId: "1",
      repo: "owner-user/notes",
      branch: "main",
      filePath: null,
      accessToken: "owner-token",
      expiresIn: "invalid",
      sharedWith: null,
      sharedWithName: null,
    });

    const share = await getShare(id);
    expect(share?.expires_at).toBeNull();
  });
});

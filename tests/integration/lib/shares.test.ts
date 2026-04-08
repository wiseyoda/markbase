// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  createShare,
  deleteShare,
  getShare,
  listShares,
  listSharesForRepo,
  listSharesWithMe,
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

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../../helpers/postgres";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import {
  getSyncedRepos,
  isSynced,
  toggleSyncRepo,
} from "@/lib/synced-repos";

describe("synced repos", () => {
  useTestDatabase();

  beforeEach(() => {
    authMock.mockResolvedValue({
      user: { id: "1" },
    });
  });

  it("toggles and reads synced repos", async () => {
    expect(await getSyncedRepos()).toEqual([]);
    expect(await isSynced("owner-user/notes")).toBe(false);
    expect(await toggleSyncRepo("owner-user/notes")).toBe(true);
    expect(await getSyncedRepos()).toEqual(["owner-user/notes"]);
    expect(await isSynced("owner-user/notes")).toBe(true);
    expect(await toggleSyncRepo("owner-user/notes")).toBe(false);
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValue(null);

    await expect(getSyncedRepos()).rejects.toThrow("Not authenticated");
  });
});

// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  getUserGitHubToken,
  saveUserGitHubToken,
  searchUsers,
  upsertUser,
} from "@/lib/users";
import { useTestDatabase } from "../../helpers/postgres";

describe("users", () => {
  useTestDatabase();

  it("upserts and searches users", async () => {
    await upsertUser({
      id: "1",
      login: "owner-user",
      name: "Owner User",
      avatarUrl: "https://example.com/owner.png",
    });

    expect(await searchUsers("o")).toEqual([]);
    expect(await searchUsers("owner")).toEqual([
      {
        id: "1",
        login: "owner-user",
        name: "Owner User",
        avatar_url: "https://example.com/owner.png",
      },
    ]);

    await upsertUser({
      id: "1",
      login: "owner-renamed",
      name: "Owner Updated",
      avatarUrl: null,
    });

    expect(await searchUsers("updated")).toEqual([
      {
        id: "1",
        login: "owner-renamed",
        name: "Owner Updated",
        avatar_url: null,
      },
    ]);
  });

  it("keeps the latest GitHub token per user, encrypted at rest", async () => {
    await upsertUser({ id: "1", login: "owner-user", name: null, avatarUrl: null });
    await expect(getUserGitHubToken("1")).resolves.toBeNull();

    await upsertUser({
      id: "1",
      login: "owner-user",
      name: null,
      avatarUrl: null,
      githubToken: "first-token",
    });
    await expect(getUserGitHubToken("1")).resolves.toBe("first-token");

    // A sign-in that carries no token must not erase the stored one.
    await upsertUser({ id: "1", login: "owner-user", name: null, avatarUrl: null });
    await expect(getUserGitHubToken("1")).resolves.toBe("first-token");

    await saveUserGitHubToken("1", "second-token");
    await expect(getUserGitHubToken("1")).resolves.toBe("second-token");

    const { getDb } = await import("@/lib/db");
    const [row] = await getDb()`SELECT github_token FROM users WHERE id = '1'`;
    expect(row.github_token).not.toContain("second-token");

    await expect(getUserGitHubToken("missing")).resolves.toBeNull();
  });
});

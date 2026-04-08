// @vitest-environment node

import { describe, expect, it } from "vitest";
import { searchUsers, upsertUser } from "@/lib/users";
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
});

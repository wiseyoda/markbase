// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepos, getReposByName, getUsername, groupRepos, LANGUAGE_COLORS, type GitHubRepo } from "@/lib/dashboard";

function makeRepo(
  owner: string,
  name: string,
  pushedAt: string,
  archived = false,
): GitHubRepo {
  return {
    id: Math.random(),
    name,
    full_name: `${owner}/${name}`,
    description: null,
    html_url: `https://github.com/${owner}/${name}`,
    private: false,
    archived,
    language: "TypeScript",
    default_branch: "main",
    created_at: pushedAt,
    updated_at: pushedAt,
    pushed_at: pushedAt,
    size: 1,
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    watchers_count: 0,
    topics: [],
    owner: {
      login: owner,
      type: owner === "acme" ? "Organization" : "User",
    },
  };
}

describe("dashboard helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches repos across paginated responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => new Array(100).fill(makeRepo("owner-user", "notes", "2026-01-03T00:00:00.000Z")),
        headers: new Headers({
          link: '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=2>; rel="last"',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [makeRepo("acme", "docs", "2026-01-02T00:00:00.000Z")],
      });

    vi.stubGlobal("fetch", fetchMock);

    const repos = await getRepos("owner-token");

    expect(repos).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the GitHub username", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ login: "owner-user" }),
      }),
    );

    await expect(getUsername("owner-token")).resolves.toBe("owner-user");
  });

  it("stops fetching when GitHub returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    await expect(getRepos("owner-token")).resolves.toEqual([]);
  });

  it("groups repos by owner and sorts the signed-in owner first", () => {
    const groups = groupRepos(
      [
        makeRepo("acme", "archived", "2026-01-01T00:00:00.000Z", true),
        makeRepo("owner-user", "notes", "2026-01-03T00:00:00.000Z"),
        makeRepo("owner-user", "guide", "2026-01-02T00:00:00.000Z"),
      ],
      "owner-user",
    );

    expect(groups[0].owner).toBe("owner-user");
    expect(groups[0].active.map((repo) => repo.name)).toEqual([
      "notes",
      "guide",
    ]);
    expect(groups[1].archived.map((repo) => repo.name)).toEqual(["archived"]);
  });

  it("sorts non-current owners alphabetically", () => {
    const groups = groupRepos(
      [
        makeRepo("zeta", "z-notes", "2026-01-01T00:00:00.000Z"),
        makeRepo("alpha", "a-notes", "2026-01-01T00:00:00.000Z"),
      ],
      "owner-user",
    );

    expect(groups.map((group) => group.owner)).toEqual(["alpha", "zeta"]);
  });

  it("moves the matching username ahead when it is in the second position", () => {
    const groups = groupRepos(
      [
        makeRepo("alpha", "a-notes", "2026-01-01T00:00:00.000Z"),
        makeRepo("owner-user", "notes", "2026-01-01T00:00:00.000Z"),
      ],
      "owner-user",
    );

    expect(groups.map((group) => group.owner)).toEqual(["owner-user", "alpha"]);
  });

  it("exports a non-empty language color map", () => {
    expect(Object.keys(LANGUAGE_COLORS).length).toBeGreaterThan(10);
    expect(LANGUAGE_COLORS.TypeScript).toBe("#3178c6");
    expect(LANGUAGE_COLORS.Python).toBe("#3572A5");
  });

  it("fetches repos by name individually", async () => {
    const repo1 = makeRepo("owner", "repo1", "2026-01-01T00:00:00.000Z");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => repo1 })
      .mockResolvedValueOnce({ ok: false });

    vi.stubGlobal("fetch", fetchMock);

    const results = await getReposByName("token", ["owner/repo1", "owner/missing"]);

    expect(results).toHaveLength(1);
    expect(results[0].full_name).toBe("owner/repo1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty array for empty input", async () => {
    const results = await getReposByName("token", []);
    expect(results).toEqual([]);
  });
});

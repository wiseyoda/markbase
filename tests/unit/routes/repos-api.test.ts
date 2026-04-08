// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const getReposMock = vi.fn();
const getUsernameMock = vi.fn();
const groupReposMock = vi.fn();
const authMock = vi.fn();

vi.mock("@/lib/dashboard", () => ({
  getRepos: getReposMock,
  getUsername: getUsernameMock,
  groupRepos: groupReposMock,
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("GET /api/repos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/repos/route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
  });

  it("returns grouped repos and total count", async () => {
    authMock.mockResolvedValue({ accessToken: "test-token" });
    const repos = [
      { full_name: "owner/repo1" },
      { full_name: "owner/repo2" },
    ];
    const groups = [{ owner: "owner", active: repos, archived: [] }];
    getReposMock.mockResolvedValue(repos);
    getUsernameMock.mockResolvedValue("owner");
    groupReposMock.mockReturnValue(groups);

    const { GET } = await import("@/app/api/repos/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCount).toBe(2);
    expect(data.groups).toEqual(groups);
    expect(getReposMock).toHaveBeenCalledWith("test-token");
    expect(getUsernameMock).toHaveBeenCalledWith("test-token");
  });
});

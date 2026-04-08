import { afterEach, describe, expect, it } from "vitest";
import {
  getGitHubApiBaseUrl,
  getGitHubRawBaseUrl,
  getGitHubWebBaseUrl,
  githubApiUrl,
  githubRawUrl,
  githubWebUrl,
} from "@/lib/github-config";

describe("github config", () => {
  afterEach(() => {
    delete process.env.GITHUB_API_BASE_URL;
    delete process.env.GITHUB_WEB_BASE_URL;
    delete process.env.GITHUB_RAW_BASE_URL;
  });

  it("uses default GitHub endpoints", () => {
    expect(getGitHubApiBaseUrl()).toBe("https://api.github.com");
    expect(getGitHubWebBaseUrl()).toBe("https://github.com");
    expect(getGitHubRawBaseUrl()).toBe("https://raw.githubusercontent.com");
  });

  it("normalizes configured endpoints", () => {
    process.env.GITHUB_API_BASE_URL = "http://localhost:4000/";
    process.env.GITHUB_WEB_BASE_URL = "http://localhost:5000/";
    process.env.GITHUB_RAW_BASE_URL = "http://localhost:6000/";

    expect(githubApiUrl("/user")).toBe("http://localhost:4000/user");
    expect(githubWebUrl("/login/oauth/authorize")).toBe(
      "http://localhost:5000/login/oauth/authorize",
    );
    expect(githubRawUrl("owner", "repo", "main", "README.md")).toBe(
      "http://localhost:6000/owner/repo/main/README.md",
    );
  });
});

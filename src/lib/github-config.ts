function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getGitHubApiBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.GITHUB_API_BASE_URL || "https://api.github.com",
  );
}

export function getGitHubWebBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.GITHUB_WEB_BASE_URL || "https://github.com",
  );
}

export function getGitHubRawBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.GITHUB_RAW_BASE_URL || "https://raw.githubusercontent.com",
  );
}

export function githubApiUrl(path: string): string {
  return `${getGitHubApiBaseUrl()}${path}`;
}

export function githubWebUrl(path: string): string {
  return `${getGitHubWebBaseUrl()}${path}`;
}

export function githubRawUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): string {
  return `${getGitHubRawBaseUrl()}/${owner}/${repo}/${ref}/${path}`;
}

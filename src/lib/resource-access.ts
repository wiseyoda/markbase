import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db";
import { githubApiUrl } from "@/lib/github-config";
import { getShare, type ShareWithToken } from "@/lib/shares";
import type { McpContext } from "@/lib/mcp/types";

export interface ResourceRef {
  repo: string;
  branch: string;
  path?: string | null;
}

export interface ResourceAccess {
  accessToken: string;
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  canModerate: boolean;
  repositoryPrivate: boolean | null;
  defaultBranch: string | null;
  via: "session" | "share" | "mcp";
}

export class ResourceAccessError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "ResourceAccessError";
  }
}

export function parseRepositorySlug(repo: string): {
  owner: string;
  name: string;
} {
  if (typeof repo !== "string") {
    throw new ResourceAccessError("Invalid repository");
  }
  const parts = repo.split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || !/^[A-Za-z0-9_.-]+$/.test(part)) ||
    parts[0].length > 39 ||
    parts[1].length > 100
  ) {
    throw new ResourceAccessError("Invalid repository");
  }
  return { owner: parts[0], name: parts[1] };
}

export function validateResourceRef(resource: ResourceRef): ResourceRef {
  parseRepositorySlug(resource.repo);

  if (
    typeof resource.branch !== "string" ||
    !resource.branch ||
    resource.branch.length > 255 ||
    /[\0-\x20~^:?*[\]\\\x7f]/.test(resource.branch) ||
    resource.branch.includes("..") ||
    resource.branch.includes("@{") ||
    resource.branch.includes("//") ||
    resource.branch.startsWith("/") ||
    resource.branch.endsWith("/") ||
    resource.branch.endsWith(".") ||
    resource.branch
      .split("/")
      .some(
        (segment) =>
          !segment || segment.startsWith(".") || segment.endsWith(".lock"),
      )
  ) {
    throw new ResourceAccessError("Invalid branch");
  }

  if (resource.path != null) {
    const path = resource.path;
    if (typeof path !== "string") {
      throw new ResourceAccessError("Invalid path");
    }
    const segments = path.split("/");
    if (
      path.startsWith("/") ||
      path.length > 4_096 ||
      /[\0-\x1f\x7f\\]/.test(path) ||
      segments.some((segment) => segment === "." || segment === "..")
    ) {
      throw new ResourceAccessError("Invalid path");
    }
  }

  return resource;
}

export function repositoryFromFileKey(fileKey: string): string {
  const [owner, repo, ...remainder] = fileKey.split("/");
  if (!owner || !repo || remainder.length === 0) {
    throw new ResourceAccessError("Invalid comment resource");
  }
  const slug = `${owner}/${repo}`;
  parseRepositorySlug(slug);
  return slug;
}

function normalizeScopePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function isShareResourceInScope(
  share: Pick<ShareWithToken, "repo" | "branch" | "type" | "file_path">,
  resource: ResourceRef,
): boolean {
  validateResourceRef(resource);

  if (
    share.repo.toLowerCase() !== resource.repo.toLowerCase() ||
    share.branch !== resource.branch
  ) {
    return false;
  }

  if (resource.path == null) return share.type === "repo";

  const requestedPath = normalizeScopePath(resource.path);
  if (share.type === "repo") return true;

  const sharePath = normalizeScopePath(share.file_path || "");
  if (!sharePath) return false;
  if (share.type === "file") return requestedPath === sharePath;
  return requestedPath === sharePath || requestedPath.startsWith(`${sharePath}/`);
}

interface GitHubRepositoryResponse {
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
  };
}

function describeGitHubFailure(status: number, repo: string): string {
  switch (status) {
    case 401:
      return `GitHub rejected the stored credential (401) for ${repo}; re-authorize Markbase`;
    case 403:
      return `GitHub returned 403 for ${repo} (forbidden or rate limited)`;
    case 404:
      return `GitHub returned 404 for ${repo} (repository not found or not accessible to this GitHub account)`;
    default:
      return `GitHub returned ${status} for ${repo}`;
  }
}

export async function verifyGitHubRepositoryAccess(
  accessToken: string,
  repo: string,
): Promise<{
  canModerate: boolean;
  repositoryPrivate: boolean;
  defaultBranch: string;
}> {
  const { owner, name } = parseRepositorySlug(repo);
  const response = await fetch(
    githubApiUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    ),
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    console.warn("[markbase] repository verification failed", {
      repo,
      status: response.status,
    });
    throw new ResourceAccessError(
      `Repository access could not be verified: ${describeGitHubFailure(
        response.status,
        repo,
      )}`,
    );
  }

  const repository = (await response.json()) as GitHubRepositoryResponse;
  if (repository.full_name?.toLowerCase() !== repo.toLowerCase()) {
    console.warn("[markbase] repository verification failed", {
      repo,
      status: response.status,
      resolved: repository.full_name ?? null,
    });
    throw new ResourceAccessError(
      `Repository access could not be verified: GitHub resolved ${repo} to ${
        repository.full_name ?? "an unknown repository"
      }`,
    );
  }

  return {
    canModerate: Boolean(
      repository.permissions?.admin || repository.permissions?.maintain,
    ),
    repositoryPrivate: repository.private === true,
    defaultBranch: repository.default_branch || "main",
  };
}

async function authorizeShare(
  shareId: string,
  resource: ResourceRef,
  requireUser: boolean,
): Promise<ResourceAccess> {
  const share = await withDbRetry(() => getShare(shareId));
  if (!share || !isShareResourceInScope(share, resource)) {
    throw new ResourceAccessError();
  }

  const session = share.shared_with || requireUser ? await auth() : null;
  if (share.shared_with) {
    if (!session?.user?.id || session.user.id !== share.shared_with) {
      throw new ResourceAccessError();
    }
  }
  if (requireUser && !session?.user?.id) {
    throw new ResourceAccessError("Not authenticated");
  }

  const repoOwner = parseRepositorySlug(resource.repo).owner;
  return {
    accessToken: share.accessToken || "",
    actorId: session?.user?.id || null,
    actorLogin: session?.user?.login || null,
    actorName: session?.user?.name || null,
    actorAvatar: session?.user?.image || null,
    canModerate:
      session?.user?.login?.toLowerCase() === repoOwner.toLowerCase(),
    repositoryPrivate: share.repo_private,
    defaultBranch: share.branch,
    via: "share",
  };
}

export async function authorizeResourceAccess(
  resource: ResourceRef,
  options: { shareId?: string; requireUser?: boolean } = {},
): Promise<ResourceAccess> {
  validateResourceRef(resource);
  if (options.shareId) {
    return authorizeShare(
      options.shareId,
      resource,
      options.requireUser ?? false,
    );
  }

  const session = await auth();
  if (!session?.user?.id || !session.accessToken) {
    throw new ResourceAccessError("Not authenticated");
  }

  const repository = await verifyGitHubRepositoryAccess(
    session.accessToken,
    resource.repo,
  );
  const repoOwner = parseRepositorySlug(resource.repo).owner;
  return {
    accessToken: session.accessToken,
    actorId: session.user.id,
    actorLogin: session.user.login || null,
    actorName: session.user.name || null,
    actorAvatar: session.user.image || null,
    canModerate:
      repository.canModerate ||
      session.user.login?.toLowerCase() === repoOwner.toLowerCase(),
    repositoryPrivate: repository.repositoryPrivate,
    defaultBranch: repository.defaultBranch,
    via: "session",
  };
}

export async function authorizeMcpRepositoryAccess(
  repo: string,
  context: McpContext,
): Promise<ResourceAccess> {
  const repository = await verifyGitHubRepositoryAccess(
    context.githubToken,
    repo,
  );
  const repoOwner = parseRepositorySlug(repo).owner;
  return {
    accessToken: context.githubToken,
    actorId: context.userId,
    actorLogin: context.userLogin,
    actorName: context.userName,
    actorAvatar: context.userAvatar,
    canModerate:
      repository.canModerate ||
      context.userLogin.toLowerCase() === repoOwner.toLowerCase(),
    repositoryPrivate: repository.repositoryPrivate,
    defaultBranch: repository.defaultBranch,
    via: "mcp",
  };
}

export async function authorizeMcpResourceAccess(
  resource: ResourceRef,
  context: McpContext,
): Promise<ResourceAccess> {
  validateResourceRef(resource);
  return authorizeMcpRepositoryAccess(resource.repo, context);
}

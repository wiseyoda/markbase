// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockBuildFileKey,
  mockCountOpenComments,
  mockGetComments,
  mockGetCommentsByPrefix,
  mockGetCommentById,
  mockCreateComment,
  mockResolveComment,
  mockResolveComments,
  mockUnresolveComment,
  mockSoftDeleteComment,
  mockAuthorizeMcpRepositoryAccess,
  mockAuthorizeMcpResourceAccess,
  mockRepositoryFromFileKey,
} = vi.hoisted(() => ({
  mockBuildFileKey: vi.fn(),
  mockCountOpenComments: vi.fn(),
  mockGetComments: vi.fn(),
  mockGetCommentsByPrefix: vi.fn(),
  mockGetCommentById: vi.fn(),
  mockCreateComment: vi.fn(),
  mockResolveComment: vi.fn(),
  mockResolveComments: vi.fn(),
  mockUnresolveComment: vi.fn(),
  mockSoftDeleteComment: vi.fn(),
  mockAuthorizeMcpRepositoryAccess: vi.fn(),
  mockAuthorizeMcpResourceAccess: vi.fn(),
  mockRepositoryFromFileKey: vi.fn(),
}));

vi.mock("@/lib/resource-access", () => ({
  authorizeMcpRepositoryAccess: mockAuthorizeMcpRepositoryAccess,
  authorizeMcpResourceAccess: mockAuthorizeMcpResourceAccess,
  repositoryFromFileKey: mockRepositoryFromFileKey,
}));

vi.mock("@/lib/comments", () => ({
  buildFileKey: mockBuildFileKey,
  countOpenComments: mockCountOpenComments,
  getComments: mockGetComments,
  getCommentsByPrefix: mockGetCommentsByPrefix,
  getCommentById: mockGetCommentById,
  createComment: mockCreateComment,
  resolveComment: mockResolveComment,
  resolveComments: mockResolveComments,
  unresolveComment: mockUnresolveComment,
  softDeleteComment: mockSoftDeleteComment,
}));

import { executeTool, getToolsList } from "@/lib/mcp/tools";

const context = {
  userId: "1",
  userLogin: "owner-user",
  userName: "Owner User",
  userAvatar: "https://example.com/owner.png",
  githubToken: "owner-token",
};

describe("MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeMcpRepositoryAccess.mockResolvedValue({
      actorId: "1",
      canModerate: true,
    });
    mockAuthorizeMcpResourceAccess.mockResolvedValue({
      actorId: "1",
      canModerate: true,
    });
    mockRepositoryFromFileKey.mockReturnValue("owner/repo");
  });

  it("lists tools", () => {
    expect(getToolsList().map((tool) => tool.name)).toContain("tools/call".replace("tools/call", "get_comments"));
  });

  it("lists files with comments", async () => {
    mockCountOpenComments.mockResolvedValue({
      "owner/repo/main/README.md": { count: 2, latest: "2026-01-01" },
      "external-key": { count: 1, latest: "2026-01-02" },
    });

    await expect(
      executeTool("list_files_with_comments", { repo: "owner/repo" }, context),
    ).resolves.toEqual({
      files: [
        {
          file_path: "README.md",
          open_comment_count: 2,
          last_activity: "2026-01-01",
        },
        {
          file_path: "external-key",
          open_comment_count: 1,
          last_activity: "2026-01-02",
        },
      ],
      total: 2,
    });
  });

  it("gets folder and file comments", async () => {
    mockBuildFileKey.mockResolvedValue("owner/repo/main/docs/");
    mockGetCommentsByPrefix.mockResolvedValue({
      comments: [{ id: "1", file_key: "key", author_name: "Owner", author_avatar: null, quote: null, body: "Body", parent_id: null, resolved_at: null, created_at: "2026-01-01", replies: [] }],
      nextCursor: "cursor",
    });

    await expect(
      executeTool(
        "get_comments",
        { repo: "owner/repo", path: "docs/" },
        context,
      ),
    ).resolves.toEqual({
      comments: [
        {
          id: "1",
          file_key: "key",
          author: "Owner",
          quote: null,
          body: "Body",
          resolved: false,
          created_at: "2026-01-01",
          replies: [],
        },
      ],
      next_cursor: "cursor",
    });

    mockBuildFileKey.mockResolvedValue("owner/repo/main/README.md");
    mockGetComments.mockResolvedValue([
      {
        id: "1",
        file_key: "key",
        author_name: "Owner",
        author_avatar: null,
        quote: null,
        body: "Body",
        parent_id: null,
        resolved_at: null,
        created_at: "2026-01-01",
        replies: [],
      },
    ]);

    await expect(
      executeTool(
        "get_comments",
        { repo: "owner/repo", path: "README.md" },
        context,
      ),
    ).resolves.toEqual({
      comments: [
        {
          id: "1",
          file_key: "key",
          author: "Owner",
          quote: null,
          body: "Body",
          resolved: false,
          created_at: "2026-01-01",
          replies: [],
        },
      ],
      next_cursor: null,
    });
  });

  it("adds, replies to, resolves, unreolves, deletes, and bulk resolves comments", async () => {
    mockBuildFileKey.mockResolvedValue("key");
    mockCreateComment.mockResolvedValue({
      id: "1",
      file_key: "key",
      author_name: "Owner User",
      author_avatar: null,
      quote: null,
      body: "Body",
      parent_id: null,
      resolved_at: null,
      created_at: "2026-01-01",
      replies: [],
    });
    mockGetCommentById.mockResolvedValue({
      id: "parent",
      file_key: "owner/repo/main/README.md",
      author_id: "1",
      parent_id: null,
    });
    mockResolveComment.mockResolvedValue(true);
    mockResolveComments.mockResolvedValue(["1"]);
    mockUnresolveComment.mockResolvedValue(true);
    mockSoftDeleteComment.mockResolvedValue(true);

    await expect(
      executeTool(
        "add_comment",
        { repo: "owner/repo", file_path: "README.md", body: "Body" },
        context,
      ),
    ).resolves.toEqual({
      comment: {
        id: "1",
        file_key: "key",
        author: "Owner User",
        quote: null,
        body: "Body",
        resolved: false,
        created_at: "2026-01-01",
        replies: [],
      },
    });

    await expect(
      executeTool(
        "reply_to_comment",
        { comment_id: "parent", body: "Reply" },
        context,
      ),
    ).resolves.toEqual({
      comment: {
        id: "1",
        file_key: "key",
        author: "Owner User",
        quote: null,
        body: "Body",
        resolved: false,
        created_at: "2026-01-01",
        replies: [],
      },
    });

    await expect(
      executeTool("resolve_comment", { comment_id: "1" }, context),
    ).resolves.toEqual({ resolved: true });
    await expect(
      executeTool("bulk_resolve_comments", { comment_ids: ["1", "2"] }, context),
    ).resolves.toEqual({ resolved: 1, failed: ["2"], total: 2 });
    await expect(
      executeTool("unresolve_comment", { comment_id: "1" }, context),
    ).resolves.toEqual({ unresolved: true });
    await expect(
      executeTool(
        "delete_comment",
        { comment_id: "1", repo_owner: "owner-user" },
        context,
      ),
    ).resolves.toEqual({ deleted: true });
    await expect(
      executeTool(
        "reply_and_resolve",
        { comment_id: "parent", body: "Resolved" },
        context,
      ),
    ).resolves.toEqual({
      reply: {
        id: "1",
        file_key: "key",
        author: "Owner User",
        quote: null,
        body: "Body",
        resolved: false,
        created_at: "2026-01-01",
        replies: [],
      },
      resolved: true,
    });
  });

  it("surfaces tool errors", async () => {
    mockGetCommentById.mockResolvedValue(null);
    mockResolveComment.mockResolvedValue(false);
    mockUnresolveComment.mockResolvedValue(false);
    mockSoftDeleteComment.mockResolvedValue(false);

    await expect(
      executeTool("reply_to_comment", { comment_id: "missing", body: "Reply" }, context),
    ).rejects.toThrow("Comment not found or not authorized");

    mockGetCommentById.mockResolvedValue({
      id: "1",
      file_key: "owner/repo/main/README.md",
      author_id: "1",
      parent_id: null,
    });
    await expect(
      executeTool("resolve_comment", { comment_id: "1" }, context),
    ).rejects.toThrow("Comment not found or already resolved");
    await expect(
      executeTool("unresolve_comment", { comment_id: "1" }, context),
    ).rejects.toThrow("Comment not found or not resolved");
    await expect(
      executeTool("delete_comment", { comment_id: "1" }, context),
    ).rejects.toThrow("Comment not found or not authorized to delete");
    await expect(
      executeTool("unknown_tool", {}, context),
    ).rejects.toThrow("Unknown tool: unknown_tool");

    mockGetCommentById.mockResolvedValue(null);
    await expect(
      executeTool(
        "reply_and_resolve",
        { comment_id: "missing", body: "Resolved" },
        context,
      ),
    ).rejects.toThrow("Comment not found or not authorized");
  });

  it("validates MCP resource, comment, and pagination inputs", async () => {
    await expect(
      executeTool(
        "add_comment",
        { repo: "owner/repo", file_path: "README.md", body: "" },
        context,
      ),
    ).rejects.toThrow("Invalid body");
    await expect(
      executeTool(
        "get_comments",
        { repo: "owner/repo", path: "README.md", limit: 101 },
        context,
      ),
    ).rejects.toThrow("limit must be an integer between 1 and 100");
    mockAuthorizeMcpResourceAccess.mockRejectedValueOnce(
      new Error("Invalid path"),
    );
    await expect(
      executeTool(
        "get_comments",
        { repo: "owner/repo", path: "../secret.md" },
        context,
      ),
    ).rejects.toThrow("Invalid path");
    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(mockGetComments).not.toHaveBeenCalled();
  });

  it("denies repository and comment access before reading or mutating data", async () => {
    mockAuthorizeMcpResourceAccess.mockRejectedValue(
      new Error("Repository access could not be verified"),
    );
    mockAuthorizeMcpRepositoryAccess.mockRejectedValue(
      new Error("Repository access could not be verified"),
    );

    await expect(
      executeTool("get_comments", { repo: "blocked/private", path: "README.md" }, context),
    ).rejects.toThrow("Repository access could not be verified");
    expect(mockGetComments).not.toHaveBeenCalled();

    mockGetCommentById.mockResolvedValue({
      id: "foreign",
      file_key: "blocked/private/main/README.md",
      author_id: "2",
      parent_id: null,
    });
    await expect(
      executeTool("resolve_comment", { comment_id: "foreign" }, context),
    ).rejects.toThrow("Repository access could not be verified");
    expect(mockResolveComment).not.toHaveBeenCalled();
  });

  it("denies resolution changes by read-only non-authors", async () => {
    mockAuthorizeMcpRepositoryAccess.mockResolvedValue({
      actorId: "1",
      canModerate: false,
    });
    mockGetCommentById.mockResolvedValue({
      id: "other-comment",
      file_key: "owner/repo/main/README.md",
      author_id: "2",
      parent_id: null,
    });

    for (const [name, args] of [
      ["resolve_comment", { comment_id: "other-comment" }],
      ["unresolve_comment", { comment_id: "other-comment" }],
      ["reply_and_resolve", { comment_id: "other-comment", body: "Reply" }],
      ["bulk_resolve_comments", { comment_ids: ["other-comment"] }],
    ] as const) {
      await expect(executeTool(name, args, context)).rejects.toThrow(
        "Comment not found or not authorized",
      );
    }
    expect(mockResolveComment).not.toHaveBeenCalled();
    expect(mockUnresolveComment).not.toHaveBeenCalled();
    expect(mockResolveComments).not.toHaveBeenCalled();
  });

  it("rejects nested replies and bounds bulk resolution work", async () => {
    mockGetCommentById.mockResolvedValue({
      id: "reply",
      file_key: "owner/repo/main/README.md",
      author_id: "1",
      parent_id: "parent",
    });
    await expect(
      executeTool(
        "reply_to_comment",
        { comment_id: "reply", body: "Nested" },
        context,
      ),
    ).rejects.toThrow("Replies can only be added to top-level comments");

    await expect(
      executeTool(
        "bulk_resolve_comments",
        { comment_ids: Array.from({ length: 101 }, (_, index) => String(index)) },
        context,
      ),
    ).rejects.toThrow("at most 100 valid IDs");
  });

  it("authorizes each repository once during bulk resolution", async () => {
    mockGetCommentById.mockImplementation(async (id: string) => ({
      id,
      file_key: "owner/repo/main/README.md",
      author_id: "1",
      parent_id: null,
    }));
    mockResolveComments.mockResolvedValue(["1", "2"]);

    await executeTool(
      "bulk_resolve_comments",
      { comment_ids: ["1", "2", "2"] },
      context,
    );

    expect(mockAuthorizeMcpRepositoryAccess).toHaveBeenCalledTimes(1);
    expect(mockResolveComments).toHaveBeenCalledWith(["1", "2"], "1");
  });

  it("formats replies when reading comments", async () => {
    mockBuildFileKey.mockResolvedValue("owner/repo/main/README.md");
    mockGetComments.mockResolvedValue([
      {
        id: "1",
        file_key: "key",
        author_name: "Owner",
        author_avatar: null,
        quote: null,
        body: "Body",
        parent_id: null,
        resolved_at: null,
        created_at: "2026-01-01",
        replies: [
          {
            id: "2",
            author_name: "Reviewer",
            body: "Reply",
            created_at: "2026-01-02",
          },
        ],
      },
    ]);

    await expect(
      executeTool(
        "get_comments",
        { repo: "owner/repo", path: "README.md", include_resolved: true },
        context,
      ),
    ).resolves.toEqual({
      comments: [
        {
          id: "1",
          file_key: "key",
          author: "Owner",
          quote: null,
          body: "Body",
          resolved: false,
          created_at: "2026-01-01",
          replies: [
            {
              id: "2",
              author: "Reviewer",
              body: "Reply",
              created_at: "2026-01-02",
            },
          ],
        },
      ],
      next_cursor: null,
    });
  });
});

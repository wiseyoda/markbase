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
      file_key: "key",
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
    ).rejects.toThrow("Comment missing not found");
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
    await expect(
      executeTool(
        "reply_and_resolve",
        { comment_id: "missing", body: "Resolved" },
        context,
      ),
    ).rejects.toThrow("Comment missing not found");
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

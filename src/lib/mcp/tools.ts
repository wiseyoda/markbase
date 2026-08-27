import {
  buildFileKey,
  countOpenComments,
  getComments,
  getCommentsByPrefix,
  getCommentById,
  createComment,
  resolveComment,
  resolveComments,
  unresolveComment,
  softDeleteComment,
} from "@/lib/comments";
import {
  authorizeMcpRepositoryAccess,
  authorizeMcpResourceAccess,
  repositoryFromFileKey,
  type ResourceAccess,
} from "@/lib/resource-access";
import type { McpToolDefinition, McpContext } from "./types";

async function authorizeToolRepository(repo: string, ctx: McpContext) {
  return authorizeMcpRepositoryAccess(repo, ctx);
}

async function authorizeToolResource(
  resource: { repo: string; branch: string; path?: string | null },
  ctx: McpContext,
) {
  return authorizeMcpResourceAccess(resource, ctx);
}

async function getToolComment(commentId: string) {
  if (
    typeof commentId !== "string" ||
    !commentId ||
    commentId.length > 100
  ) {
    throw new Error("Invalid comment ID");
  }
  const comment = await getCommentById(commentId);
  if (!comment) throw new Error("Comment not found or not authorized");
  return {
    comment,
    repo: repositoryFromFileKey(comment.file_key),
  };
}

async function getAuthorizedToolComment(commentId: string, ctx: McpContext) {
  const { comment, repo } = await getToolComment(commentId);
  const access = await authorizeToolRepository(repo, ctx);
  return { comment, access };
}

function requireCommentMutationPermission(
  comment: { author_id: string },
  access: ResourceAccess,
) {
  if (comment.author_id !== access.actorId && !access.canModerate) {
    throw new Error("Comment not found or not authorized");
  }
}

function requireString(
  value: unknown,
  field: string,
  allowEmpty = false,
  maxLength = 1_000,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > maxLength
  ) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  allowEmpty = false,
  maxLength = 1_000,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field, allowEmpty, maxLength);
}

const TOOLS: McpToolDefinition[] = [
  {
    name: "list_files_with_comments",
    description:
      "List files that have open (unresolved) comments, with counts. " +
      "Scope to a repo, or narrow to a folder by providing a path prefix.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: 'Repository in "owner/name" format',
        },
        branch: {
          type: "string",
          description: "Branch name (defaults to main)",
        },
        folder: {
          type: "string",
          description:
            'Optional folder prefix, e.g. "knowledge/plan/". Omit for entire repo.',
        },
      },
      required: ["repo"],
    },
    async execute(args, ctx) {
      const repo = requireString(args.repo, "repo");
      const branch = optionalString(args.branch, "branch") || "main";
      const folder = optionalString(args.folder, "folder", true) || "";
      await authorizeToolResource(
        { repo, branch, path: folder || null },
        ctx,
      );
      const prefix = `${repo}/${branch}/${folder}`;

      const counts = await countOpenComments(prefix);

      // Strip the prefix to show relative paths
      const keyPrefix = `${repo}/${branch}/`;
      const files = Object.entries(counts).map(([key, { count, latest }]) => ({
        file_path: key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key,
        open_comment_count: count,
        last_activity: latest,
      }));

      files.sort((a, b) => b.open_comment_count - a.open_comment_count);

      return { files, total: files.length };
    },
  },

  {
    name: "get_comments",
    description:
      "Get full threaded comments for a file, folder, or repo. " +
      "For a single file, provide the exact path. " +
      'For a folder, end the path with "/". ' +
      "Supports pagination via cursor.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: 'Repository in "owner/name" format',
        },
        branch: {
          type: "string",
          description: "Branch name (defaults to main)",
        },
        path: {
          type: "string",
          description:
            'File path or folder prefix. End with "/" for folder scope.',
        },
        include_resolved: {
          type: "boolean",
          description: "Include resolved comments (default false)",
        },
        limit: {
          type: "number",
          description: "Max comments to return (default 50)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
      },
      required: ["repo", "path"],
    },
    async execute(args, ctx) {
      const repo = requireString(args.repo, "repo");
      const branch = optionalString(args.branch, "branch") || "main";
      const path = requireString(args.path, "path", true);
      await authorizeToolResource({ repo, branch, path }, ctx);
      if (
        args.include_resolved !== undefined &&
        typeof args.include_resolved !== "boolean"
      ) {
        throw new Error("Invalid include_resolved");
      }
      const includeResolved = args.include_resolved === true;
      const limit = args.limit === undefined ? 50 : args.limit;
      if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100) {
        throw new Error("limit must be an integer between 1 and 100");
      }
      const cursor = optionalString(args.cursor, "cursor");
      if (cursor && Number.isNaN(Date.parse(cursor))) {
        throw new Error("Invalid cursor");
      }

      const isFolder = path.endsWith("/") || path === "";
      const fileKey = await buildFileKey(repo, branch, path);

      if (isFolder) {
        const result = await getCommentsByPrefix(fileKey, {
          includeResolved,
          limit: limit as number,
          cursor,
        });
        return {
          comments: result.comments.map(formatComment),
          next_cursor: result.nextCursor,
        };
      }

      // Single file — use existing function (returns all, no pagination)
      const all = await getComments(fileKey);
      const filtered = includeResolved
        ? all
        : all.filter((c) => !c.resolved_at);

      return {
        comments: filtered.map(formatComment),
        next_cursor: null,
      };
    },
  },

  {
    name: "add_comment",
    description:
      "Add a new comment on a file. Optionally include quoted text " +
      "that the comment refers to.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: 'Repository in "owner/name" format',
        },
        branch: {
          type: "string",
          description: "Branch name (defaults to main)",
        },
        file_path: { type: "string", description: "Path to the file" },
        body: { type: "string", description: "Comment text" },
        quote: {
          type: "string",
          description: "Quoted text from the file this comment refers to",
        },
        quote_context: {
          type: "string",
          description: "Character offset of the quote in the file",
        },
      },
      required: ["repo", "file_path", "body"],
    },
    async execute(args, ctx) {
      const repo = requireString(args.repo, "repo");
      const branch = optionalString(args.branch, "branch") || "main";
      const filePath = requireString(args.file_path, "file_path");
      const body = requireString(args.body, "body", false, 10_000);
      await authorizeToolResource({ repo, branch, path: filePath }, ctx);
      const fileKey = await buildFileKey(repo, branch, filePath);

      const comment = await createComment({
        fileKey,
        authorId: ctx.userId,
        authorName: ctx.userName,
        authorAvatar: ctx.userAvatar,
        quote: optionalString(args.quote, "quote", true, 20_000) || null,
        quoteContext:
          optionalString(args.quote_context, "quote_context", true, 256) || null,
        body,
        parentId: null,
      });

      return { comment: formatComment(comment) };
    },
  },

  {
    name: "reply_to_comment",
    description: "Reply to an existing comment thread.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: {
          type: "string",
          description: "ID of the parent comment to reply to",
        },
        body: { type: "string", description: "Reply text" },
      },
      required: ["comment_id", "body"],
    },
    async execute(args, ctx) {
      const parentId = args.comment_id as string;
      const body = requireString(args.body, "body", false, 10_000);
      const { comment: parent } = await getAuthorizedToolComment(parentId, ctx);
      if (parent.parent_id !== null) {
        throw new Error("Replies can only be added to top-level comments");
      }

      const comment = await createComment({
        fileKey: parent.file_key,
        authorId: ctx.userId,
        authorName: ctx.userName,
        authorAvatar: ctx.userAvatar,
        quote: null,
        quoteContext: null,
        body,
        parentId,
      });

      return { comment: formatComment(comment) };
    },
  },

  {
    name: "resolve_comment",
    description: "Mark a comment thread as resolved.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "ID of the comment" },
      },
      required: ["comment_id"],
    },
    async execute(args, ctx) {
      const commentId = args.comment_id as string;
      const { comment, access } = await getAuthorizedToolComment(commentId, ctx);
      requireCommentMutationPermission(comment, access);
      const ok = await resolveComment(commentId, ctx.userId);
      if (!ok) {
        throw new Error("Comment not found or already resolved");
      }
      return { resolved: true };
    },
  },

  {
    name: "bulk_resolve_comments",
    description:
      "Resolve multiple comment threads in one call. " +
      "Returns the count of successfully resolved comments.",
    inputSchema: {
      type: "object",
      properties: {
        comment_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of comment IDs to resolve",
        },
      },
      required: ["comment_ids"],
    },
    async execute(args, ctx) {
      const ids = args.comment_ids as string[];
      if (
        !Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== "string" || !id)
      ) {
        throw new Error("comment_ids must contain at most 100 valid IDs");
      }
      const uniqueIds = [...new Set(ids)];
      const comments = await Promise.all(uniqueIds.map(getToolComment));
      const repositories = [...new Set(comments.map(({ repo }) => repo))];
      const accessEntries = await Promise.all(
        repositories.map(async (repo) => [
          repo,
          await authorizeToolRepository(repo, ctx),
        ] as const),
      );
      const accessByRepo = new Map(accessEntries);
      for (const { comment, repo } of comments) {
        requireCommentMutationPermission(comment, accessByRepo.get(repo)!);
      }
      const resolvedIds = await resolveComments(uniqueIds, ctx.userId);
      const failed = uniqueIds.filter((id) => !resolvedIds.includes(id));
      return { resolved: resolvedIds.length, failed, total: uniqueIds.length };
    },
  },

  {
    name: "reply_and_resolve",
    description:
      "Reply to a comment with a summary of what changed, then resolve it. " +
      "Combines reply_to_comment + resolve_comment in one call.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: {
          type: "string",
          description: "ID of the comment to reply to and resolve",
        },
        body: {
          type: "string",
          description: "Reply text explaining what was changed/fixed",
        },
      },
      required: ["comment_id", "body"],
    },
    async execute(args, ctx) {
      const parentId = args.comment_id as string;
      const body = requireString(args.body, "body", false, 10_000);
      const { comment: parent, access } = await getAuthorizedToolComment(
        parentId,
        ctx,
      );
      if (parent.parent_id !== null) {
        throw new Error("Replies can only be added to top-level comments");
      }
      requireCommentMutationPermission(parent, access);

      const reply = await createComment({
        fileKey: parent.file_key,
        authorId: ctx.userId,
        authorName: ctx.userName,
        authorAvatar: ctx.userAvatar,
        quote: null,
        quoteContext: null,
        body,
        parentId,
      });

      await resolveComment(parentId, ctx.userId);

      return { reply: formatComment(reply), resolved: true };
    },
  },

  {
    name: "unresolve_comment",
    description: "Reopen a previously resolved comment thread.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "ID of the comment" },
      },
      required: ["comment_id"],
    },
    async execute(args, ctx) {
      const commentId = args.comment_id as string;
      const { comment, access } = await getAuthorizedToolComment(commentId, ctx);
      requireCommentMutationPermission(comment, access);
      const ok = await unresolveComment(commentId);
      if (!ok) {
        throw new Error("Comment not found or not resolved");
      }
      return { unresolved: true };
    },
  },

  {
    name: "delete_comment",
    description:
      "Delete a comment. Authors can delete their own comments. " +
      "Repository maintainers can delete any comment.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "ID of the comment" },
      },
      required: ["comment_id"],
    },
    async execute(args, ctx) {
      const commentId = args.comment_id as string;
      const { comment, access } = await getAuthorizedToolComment(commentId, ctx);
      requireCommentMutationPermission(comment, access);

      const ok = await softDeleteComment(
        commentId,
        ctx.userId,
        access.canModerate,
      );
      if (!ok) {
        throw new Error("Comment not found or not authorized to delete");
      }
      return { deleted: true };
    },
  },
];

/** Format a comment for MCP output (strip internal fields) */
function formatComment(c: {
  id: string;
  file_key: string;
  author_name: string;
  author_avatar: string | null;
  quote: string | null;
  body: string;
  parent_id: string | null;
  resolved_at: string | null;
  created_at: string;
  replies?: Array<{
    id: string;
    author_name: string;
    body: string;
    created_at: string;
  }>;
}): Record<string, unknown> {
  return {
    id: c.id,
    file_key: c.file_key,
    author: c.author_name,
    quote: c.quote,
    body: c.body,
    resolved: !!c.resolved_at,
    created_at: c.created_at,
    replies: c.replies?.map((r) => ({
      id: r.id,
      author: r.author_name,
      body: r.body,
      created_at: r.created_at,
    })),
  };
}

export function getToolsList(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: McpContext,
): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.execute(args, context);
}

import {
  buildFileKey,
  countOpenComments,
  getComments,
  getCommentsByPrefix,
  getCommentById,
  createComment,
  resolveComment,
  unresolveComment,
  deleteComment,
} from "@/lib/comments";
import type { McpToolDefinition, McpContext } from "./types";

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
    async execute(args, _context) {
      const repo = args.repo as string;
      const branch = (args.branch as string) || "main";
      const folder = (args.folder as string) || "";
      const prefix = `${repo}/${branch}/${folder}`;

      const counts = await countOpenComments(prefix);

      // Strip the prefix to show relative paths
      const keyPrefix = `${repo}/${branch}/`;
      const files = Object.entries(counts).map(([key, count]) => ({
        file_path: key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key,
        open_comment_count: count,
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
    async execute(args, _context) {
      const repo = args.repo as string;
      const branch = (args.branch as string) || "main";
      const path = args.path as string;
      const includeResolved = (args.include_resolved as boolean) || false;
      const limit = (args.limit as number) || 50;
      const cursor = args.cursor as string | undefined;

      const isFolder = path.endsWith("/") || path === "";
      const fileKey = await buildFileKey(repo, branch, path);

      if (isFolder) {
        const result = await getCommentsByPrefix(fileKey, {
          includeResolved,
          limit,
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
      const repo = args.repo as string;
      const branch = (args.branch as string) || "main";
      const filePath = args.file_path as string;
      const fileKey = await buildFileKey(repo, branch, filePath);

      const comment = await createComment({
        fileKey,
        authorId: ctx.userId,
        authorName: ctx.userName,
        authorAvatar: ctx.userAvatar,
        quote: (args.quote as string) || null,
        quoteContext: (args.quote_context as string) || null,
        body: args.body as string,
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
      const parent = await getCommentById(parentId);
      if (!parent) {
        throw new Error(`Comment ${parentId} not found`);
      }

      const comment = await createComment({
        fileKey: parent.file_key,
        authorId: ctx.userId,
        authorName: ctx.userName,
        authorAvatar: ctx.userAvatar,
        quote: null,
        quoteContext: null,
        body: args.body as string,
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
      const ok = await resolveComment(args.comment_id as string, ctx.userId);
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
      let resolved = 0;
      const failed: string[] = [];

      for (const id of ids) {
        const ok = await resolveComment(id, ctx.userId);
        if (ok) resolved++;
        else failed.push(id);
      }

      return { resolved, failed, total: ids.length };
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
      const parent = await getCommentById(parentId);
      if (!parent) {
        throw new Error(`Comment ${parentId} not found`);
      }

      const reply = await createComment({
        fileKey: parent.file_key,
        authorId: ctx.userId,
        authorName: ctx.userName,
        authorAvatar: ctx.userAvatar,
        quote: null,
        quoteContext: null,
        body: args.body as string,
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
    async execute(args) {
      const ok = await unresolveComment(args.comment_id as string);
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
      "Repo owners can delete any comment if repo_owner is provided.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "ID of the comment" },
        repo_owner: {
          type: "string",
          description:
            "GitHub username of the repo owner (enables owner-level delete)",
        },
      },
      required: ["comment_id"],
    },
    async execute(args, ctx) {
      const repoOwner = args.repo_owner as string | undefined;
      const isOwner = repoOwner
        ? ctx.userLogin.toLowerCase() === repoOwner.toLowerCase()
        : false;

      const ok = await deleteComment(
        args.comment_id as string,
        ctx.userId,
        isOwner,
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

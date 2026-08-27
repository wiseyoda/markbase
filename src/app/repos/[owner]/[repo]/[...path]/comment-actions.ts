"use server";

import {
  createComment,
  getComments,
  getCommentById,
  resolveComment,
  unresolveComment,
  softDeleteComment,
  restoreComment,
  buildFileKey,
} from "@/lib/comments";
import type { Comment } from "@/lib/comments";
import { withDbRetry } from "@/lib/db";
import {
  authorizeResourceAccess,
  ResourceAccessError,
  type ResourceRef,
} from "@/lib/resource-access";

export interface CommentResourceInput {
  repo: string;
  branch: string;
  filePath: string;
  shareId?: string;
}

function toResource(input: CommentResourceInput): ResourceRef {
  return {
    repo: input.repo,
    branch: input.branch,
    path: input.filePath,
  };
}

async function getAuthorizedComment(
  commentId: string,
  resourceInput: CommentResourceInput,
  includeDeleted = false,
) {
  const access = await authorizeResourceAccess(toResource(resourceInput), {
    shareId: resourceInput.shareId,
    requireUser: true,
  });
  const expectedFileKey = await buildFileKey(
    resourceInput.repo,
    resourceInput.branch,
    resourceInput.filePath,
  );
  const comment = await withDbRetry(() =>
    getCommentById(commentId, { includeDeleted }),
  );
  if (!comment || comment.file_key !== expectedFileKey) {
    throw new ResourceAccessError();
  }
  return { access, comment };
}

export async function addComment(opts: CommentResourceInput & {
  quote: string | null;
  quoteContext: string | null;
  body: string;
  parentId: string | null;
}): Promise<Comment> {
  const access = await authorizeResourceAccess(toResource(opts), {
    shareId: opts.shareId,
    requireUser: true,
  });
  if (!access.actorId) throw new ResourceAccessError("Not authenticated");

  const body = opts.body.trim();
  if (!body || body.length > 10_000) {
    throw new Error("Comment body must be between 1 and 10000 characters");
  }
  const fKey = await buildFileKey(opts.repo, opts.branch, opts.filePath);

  if (opts.parentId) {
    const parent = await withDbRetry(() => getCommentById(opts.parentId!));
    if (!parent || parent.file_key !== fKey || parent.parent_id !== null) {
      throw new ResourceAccessError();
    }
  }

  return withDbRetry(() =>
    createComment({
      fileKey: fKey,
      authorId: access.actorId!,
      authorName: access.actorName || access.actorLogin || "Unknown",
      authorAvatar: access.actorAvatar,
      quote: opts.quote,
      quoteContext: opts.quoteContext,
      body,
      parentId: opts.parentId,
    }),
  );
}

export async function fetchComments(
  repo: string,
  branch: string,
  filePath: string,
  shareId?: string,
): Promise<Comment[]> {
  await authorizeResourceAccess(
    { repo, branch, path: filePath },
    { shareId, requireUser: true },
  );
  const fKey = await buildFileKey(repo, branch, filePath);
  return withDbRetry(() => getComments(fKey));
}

export async function resolveCommentAction(
  commentId: string,
  resource: CommentResourceInput,
): Promise<boolean> {
  const { access, comment } = await getAuthorizedComment(commentId, resource);
  const isAuthor = comment.author_id === access.actorId;
  if (!isAuthor && !access.canModerate) throw new ResourceAccessError();
  return withDbRetry(() => resolveComment(commentId, access.actorId!));
}

export async function unresolveCommentAction(
  commentId: string,
  resource: CommentResourceInput,
): Promise<boolean> {
  const { access, comment } = await getAuthorizedComment(commentId, resource);
  const isAuthor = comment.author_id === access.actorId;
  if (!isAuthor && !access.canModerate) throw new ResourceAccessError();
  return withDbRetry(() => unresolveComment(commentId));
}

export async function deleteCommentAction(
  commentId: string,
  resource: CommentResourceInput,
): Promise<boolean> {
  const { access } = await getAuthorizedComment(commentId, resource);
  return withDbRetry(() =>
    softDeleteComment(commentId, access.actorId!, access.canModerate),
  );
}

export async function restoreCommentAction(
  commentId: string,
  resource: CommentResourceInput,
): Promise<boolean> {
  const { access, comment } = await getAuthorizedComment(
    commentId,
    resource,
    true,
  );
  const isAuthor = comment.author_id === access.actorId;
  if (!isAuthor && !access.canModerate) throw new ResourceAccessError();
  return withDbRetry(() => restoreComment(commentId));
}

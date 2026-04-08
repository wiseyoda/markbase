"use server";

import { auth } from "@/auth";
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

async function getUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return {
    id: session.user.id,
    name: session.user.name || "Unknown",
    avatar: session.user.image || null,
  };
}

export async function addComment(opts: {
  repo: string;
  branch: string;
  filePath: string;
  quote: string | null;
  quoteContext: string | null;
  body: string;
  parentId: string | null;
}): Promise<Comment> {
  const user = await getUser();
  return createComment({
    fileKey: await buildFileKey(opts.repo, opts.branch, opts.filePath),
    authorId: user.id,
    authorName: user.name,
    authorAvatar: user.avatar,
    quote: opts.quote,
    quoteContext: opts.quoteContext,
    body: opts.body,
    parentId: opts.parentId,
  });
}

export async function fetchComments(
  repo: string,
  branch: string,
  filePath: string,
): Promise<Comment[]> {
  return getComments(await buildFileKey(repo, branch, filePath));
}

export async function resolveCommentAction(commentId: string): Promise<boolean> {
  const user = await getUser();
  return resolveComment(commentId, user.id);
}

export async function unresolveCommentAction(
  commentId: string,
  repoOwner?: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const comment = await getCommentById(commentId);
  if (!comment) return false;
  const isAuthor = comment.author_id === session.user.id;
  const isOwner = repoOwner
    ? session.user.login?.toLowerCase() === repoOwner.toLowerCase()
    : false;
  if (!isAuthor && !isOwner) throw new Error("Not authorized");
  return unresolveComment(commentId);
}

export async function deleteCommentAction(
  commentId: string,
  repoOwner?: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const isOwner = repoOwner
    ? session.user.login?.toLowerCase() === repoOwner.toLowerCase()
    : false;
  return softDeleteComment(commentId, session.user.id, isOwner);
}

export async function restoreCommentAction(
  commentId: string,
  repoOwner?: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const comment = await getCommentById(commentId, { includeDeleted: true });
  if (!comment) return false;
  const isAuthor = comment.author_id === session.user.id;
  const isOwner = repoOwner
    ? session.user.login?.toLowerCase() === repoOwner.toLowerCase()
    : false;
  if (!isAuthor && !isOwner) throw new Error("Not authorized");
  return restoreComment(commentId);
}

"use client";

import { useState, useTransition } from "react";
import {
  resolveCommentAction,
  unresolveCommentAction,
  deleteCommentAction,
  restoreCommentAction,
} from "./comment-actions";
import type { Comment } from "@/lib/comments";
import { relativeTime } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NewCommentForm } from "./comment-form";

export function CommentThread({
  comment,
  repo,
  branch,
  filePath,
  onUpdate,
  toast,
}: {
  comment: Comment;
  repo: string;
  branch: string;
  filePath: string;
  onUpdate: () => void;
  toast: (
    message: string,
    type?: "success" | "error" | "info",
    action?: { label: string; onClick: () => void },
  ) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleResolve = () => {
    startTransition(async () => {
      if (comment.resolved_at) {
        await unresolveCommentAction(comment.id, repo.split("/")[0]);
        onUpdate();
      } else {
        await resolveCommentAction(comment.id);
        onUpdate();
        toast("Comment resolved", "success");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const repoOwner = repo.split("/")[0];
      await deleteCommentAction(comment.id, repoOwner);
      setDeleteOpen(false);
      onUpdate();
      toast("Comment deleted", "info", {
        label: "Undo",
        onClick: () => {
          restoreCommentAction(comment.id, repoOwner).then(() => onUpdate());
        },
      });
    });
  };

  return (
    <div
      className={`group/thread border-b border-zinc-100 px-4 py-3 dark:border-zinc-800/50 ${
        comment.resolved_at ? "opacity-60" : ""
      }`}
    >
      {/* Quote */}
      {comment.quote && (
        <div className="mb-2 border-l-2 border-blue-400 pl-2 text-xs text-zinc-400 dark:text-zinc-500">
          &ldquo;{comment.quote.length > 80
            ? comment.quote.slice(0, 80) + "..."
            : comment.quote}&rdquo;
        </div>
      )}

      {/* Comment body */}
      <div className="flex gap-2">
        {comment.author_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.author_avatar}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full"
          />
        ) : (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium dark:bg-zinc-700">
            {comment.author_name[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">
              {comment.author_name}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {relativeTime(comment.created_at)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
            {comment.body}
          </p>
        </div>
      </div>

      {/* Actions -- hover-reveal on desktop, always visible on mobile */}
      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
        <button
          onClick={() => setShowReply(!showReply)}
          className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          Reply
        </button>
        <button
          onClick={handleResolve}
          disabled={isPending}
          className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          {comment.resolved_at ? "Reopen" : "Resolve"}
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
          className="rounded-md px-2 py-1.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          Delete
        </button>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title="Delete comment"
        description="This comment and its replies will be permanently deleted."
        isPending={isPending}
      />

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 mt-2 flex flex-col gap-2 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              {reply.author_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reply.author_avatar}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full"
                />
              ) : (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs dark:bg-zinc-700">
                  {reply.author_name[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {reply.author_name}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {relativeTime(reply.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                  {reply.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {showReply && (
        <div className="ml-8 mt-2">
          <NewCommentForm
            quote={null}
            quoteContext={null}
            repo={repo}
            branch={branch}
            filePath={filePath}
            parentId={comment.id}
            toast={toast}
            onSubmit={() => {
              setShowReply(false);
              onUpdate();
            }}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}
    </div>
  );
}

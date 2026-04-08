"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { addComment } from "./comment-actions";
import type { Comment } from "@/lib/comments";

export function NewCommentForm({
  quote,
  quoteContext,
  repo,
  branch,
  filePath,
  parentId,
  onOptimistic,
  toast,
  onSubmit,
  onCancel,
}: {
  quote: string | null;
  quoteContext: string | null;
  repo: string;
  branch: string;
  filePath: string;
  parentId: string | null;
  onOptimistic?: (comment: Comment) => void;
  toast: (
    message: string,
    type?: "success" | "error" | "info",
    action?: { label: string; onClick: () => void },
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const storageKey = `markbase-draft-${filePath}-${parentId || "root"}`;
  const [body, setBody] = useState(
    () => (typeof window !== "undefined"
      ? sessionStorage.getItem(storageKey) : null) ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist draft to sessionStorage on change
  useEffect(() => {
    if (body) {
      sessionStorage.setItem(storageKey, body);
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }, [body, storageKey]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!body.trim()) return;
    const text = body.trim();

    // Optimistic insert: add a temporary comment to the list immediately
    if (onOptimistic) {
      const tempComment: Comment = {
        id: `temp-${Date.now()}`,
        file_key: "",
        quote: quote,
        quote_context: quoteContext,
        body: text,
        author_id: "self",
        author_name: "You",
        author_avatar: null,
        parent_id: parentId,
        resolved_at: null,
        resolved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        replies: [],
      };
      onOptimistic(tempComment);
    }

    // Clear form and draft immediately
    setBody("");
    sessionStorage.removeItem(storageKey);

    startTransition(async () => {
      await addComment({
        repo,
        branch,
        filePath,
        quote,
        quoteContext,
        body: text,
        parentId,
      });
      toast("Comment added", "success");
      onSubmit();
    });
  };

  return (
    <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      {quote && (
        <div className="mb-2 border-l-2 border-blue-400 pl-2 text-xs text-zinc-400 dark:text-zinc-500">
          &ldquo;{quote.length > 100 ? quote.slice(0, 100) + "..." : quote}
          &rdquo;
        </div>
      )}
      <textarea
        ref={inputRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={parentId ? "Reply..." : "Add a comment..."}
        className="w-full resize-none rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-zinc-700"
        rows={2}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {"\u2318"}+Enter to submit
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !body.trim()}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {isPending ? "..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

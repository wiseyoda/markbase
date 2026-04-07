"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShareAction } from "@/app/repos/[owner]/[repo]/share-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ShareActions({
  shareId,
  shareType,
}: {
  shareId: string;
  shareType: string;
}) {
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${shareId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confirmDelete = () => {
    setDeleteOpen(false);
    startTransition(async () => {
      await deleteShareAction(shareId);
      router.refresh();
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <a
        href={`/s/${shareId}`}
        target="_blank"
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Open
      </a>
      {!shareType.startsWith("user") && (
        <button
          onClick={handleCopy}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      )}
      <button
        onClick={() => setDeleteOpen(true)}
        disabled={isPending}
        className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        {isPending ? "..." : "Delete"}
      </button>
      <ConfirmDialog
        open={deleteOpen}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
        title="Delete share"
        description="Anyone with this link will lose access."
        isPending={isPending}
      />
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { deleteShareAction } from "./share-actions";
import { useRouter } from "next/navigation";
import { timeAgo, expiryLabel } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-media-query";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface ShareItem {
  id: string;
  type: string;
  file_path: string | null;
  created_at: string;
  expires_at: string | null;
}

export function SharesDropdown({ shares }: { shares: ShareItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isMobile = useIsMobile();

  const open = pos !== null;

  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setPos(null);
      }
    };
    // Delay to avoid capturing the click that opened it
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handler),
      50,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, isMobile]);

  if (shares.length === 0) return null;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  };

  const dropdownContent = (
    <>
      {!isMobile && (
        <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Active shares for this repo
          </span>
        </div>
      )}
      <div className="max-h-64 overflow-y-auto">
        {shares.map((share) => (
          <ShareRow
            key={share.id}
            share={share}
            onDelete={() => {
              router.refresh();
            }}
          />
        ))}
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Shares
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-200 px-1 text-[10px] font-medium dark:bg-zinc-700">
          {shares.length}
        </span>
      </button>

      {open && isMobile && (
        <BottomSheet
          open={true}
          onClose={() => setPos(null)}
          title="Active shares for this repo"
        >
          {dropdownContent}
        </BottomSheet>
      )}

      {open &&
        !isMobile &&
        createPortal(
          <div
            ref={dropRef}
            className="fixed z-[100] w-80 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            style={{ top: pos.top, right: pos.right }}
          >
            {dropdownContent}
          </div>,
          document.body,
        )}
    </>
  );
}

function ShareRow({
  share,
  onDelete,
}: {
  share: ShareItem;
  onDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const url = `${window.location.origin}/s/${share.id}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteShareAction(share.id);
      onDelete();
    });
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0 dark:border-zinc-800/50">
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-zinc-100 px-1 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {share.type}
          </span>
          <span className="truncate text-xs text-zinc-600 dark:text-zinc-300">
            {share.file_path || "entire repo"}
          </span>
        </div>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {timeAgo(share.created_at)} · expires {expiryLabel(share.expires_at)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={handleCopy}
          className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
          className="rounded px-2 py-1.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
        >
          {isPending ? "..." : "Delete"}
        </button>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onConfirm={() => {
          handleDelete();
          setDeleteOpen(false);
        }}
        onCancel={() => setDeleteOpen(false)}
        title="Delete share"
        description="Anyone with this link will lose access."
        isPending={isPending}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import type { Share } from "@/lib/shares";
import { ShareItem } from "@/components/share-item";
import { BottomSheet } from "@/components/bottom-sheet";
import { Tooltip } from "@/components/tooltip";
import { useIsMobile } from "@/hooks/use-media-query";
import { useShareDialog } from "./share-dialog";

// ---------------------------------------------------------------------------
// ViewSharesButton — header button with count badge
// ---------------------------------------------------------------------------

export function ViewSharesButton({ shares }: { shares: Share[] }) {
  const [open, setOpen] = useState(false);

  if (shares.length === 0) return null;

  return (
    <>
      <Tooltip content="View shared links">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.75 7.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
            <path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-6.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z" />
          </svg>
          <span className="text-xs font-medium">{shares.length}</span>
        </button>
      </Tooltip>
      {open && (
        <ViewSharesModal shares={shares} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ViewSharesModal — dialog with repo-scoped share list
// ---------------------------------------------------------------------------

function ViewSharesModal({
  shares,
  onClose,
}: {
  shares: Share[];
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const { openShare } = useShareDialog();

  const content = (
    <div className="flex flex-col gap-3">
      {shares.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No active shares for this repo.
        </p>
      ) : (
        shares.map((share) => <ShareItem key={share.id} share={share} />)
      )}

      <button
        onClick={() => {
          onClose();
          openShare("repo", null);
        }}
        className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-4 py-2.5 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 010 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
        </svg>
        Create new share
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet open={true} onClose={onClose} title="Shared links">
        {content}
      </BottomSheet>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-shares-title"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 id="view-shares-title" className="text-lg font-semibold">
            Shared links
            <span className="ml-2 text-sm font-normal text-zinc-400 dark:text-zinc-500">
              {shares.length}
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {content}
        </div>
      </div>
    </>
  );
}

"use client";

import type { Share } from "@/lib/shares";
import { ShareActions } from "@/app/shares/share-actions-client";
import { timeAgo, expiryLabel } from "@/lib/format";

const TYPE_BADGE_CLASSES: Record<string, string> = {
  repo: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  folder: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  file: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function ShareItem({ share }: { share: Share }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1.5">
          {/* Type + path */}
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                TYPE_BADGE_CLASSES[share.type] || TYPE_BADGE_CLASSES.file
              }`}
            >
              {share.type}
            </span>
            <span className="text-sm font-medium">
              {share.type === "repo"
                ? "Entire repository"
                : share.file_path || "\u2014"}
            </span>
          </div>

          {/* Shared with */}
          <div className="flex items-center gap-2 text-xs">
            {share.shared_with ? (
              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.561 8.073a6.005 6.005 0 013.432 5.142.75.75 0 11-1.498.07 4.5 4.5 0 00-8.99 0 .75.75 0 11-1.498-.07 6.004 6.004 0 013.431-5.142 3.999 3.999 0 115.123 0zM10.5 5a2.5 2.5 0 10-5 0 2.5 2.5 0 005 0z" />
                </svg>
                Shared with{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {share.shared_with_name || "user"}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.75 7.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
                  <path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-6.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z" />
                </svg>
                Anyone with link
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>Created {timeAgo(share.created_at)}</span>
            <span>&middot;</span>
            <span>Expires: {expiryLabel(share.expires_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <ShareActions shareId={share.id} shareType={share.type} />
      </div>
    </div>
  );
}

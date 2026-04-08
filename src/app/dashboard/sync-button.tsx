"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleSyncRepo } from "@/lib/synced-repos";

interface SyncButtonProps {
  repoFullName: string;
  synced: boolean;
}

export function SyncButton({ repoFullName, synced }: SyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        startTransition(async () => {
          await toggleSyncRepo(repoFullName);
          router.refresh();
        });
      }}
      disabled={isPending}
      className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
        synced
          ? "bg-[#86D5F4]/15 text-[#4aa8d0] hover:bg-red-100 hover:text-red-800 dark:bg-[#86D5F4]/10 dark:text-[#86D5F4] dark:hover:bg-red-900 dark:hover:text-red-200"
          : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
      } ${isPending ? "opacity-50" : ""}`}
    >
      {isPending ? "..." : synced ? "Added" : "Add"}
    </button>
  );
}

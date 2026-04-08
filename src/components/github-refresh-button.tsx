"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

interface GitHubRefreshButtonProps {
  action: () => Promise<void>;
  label?: string;
  title?: string;
}

export function GitHubRefreshButton({
  action,
  label = "Refresh",
  title = "Refresh from GitHub",
}: GitHubRefreshButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await action();
            router.refresh();
            toast("Fetched the latest GitHub content", "success");
          } catch {
            toast("Could not refresh GitHub content", "error");
          }
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="currentColor"
        className={isPending ? "animate-spin" : ""}
        aria-hidden="true"
      >
        <path d="M13.5 8A5.5 5.5 0 103.44 11.09a.75.75 0 111.12 1A7 7 0 1115 8h-.75a.75.75 0 010-1.5H16a.75.75 0 01.75.75V9a.75.75 0 01-1.5 0V8h-1.75z" />
      </svg>
      <span>{isPending ? "Refreshing..." : label}</span>
    </button>
  );
}

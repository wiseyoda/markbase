"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { Tooltip } from "@/components/tooltip";

interface GitHubRefreshButtonProps {
  action: () => Promise<void>;
}

export function GitHubRefreshButton({ action }: GitHubRefreshButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <Tooltip content="Refresh from GitHub">
      <button
        type="button"
        aria-label="Refresh from GitHub"
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
        className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={isPending ? "animate-spin" : ""}
          aria-hidden="true"
        >
          <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0A5.5 5.5 0 008 2.5zM2.5 8a.75.75 0 00-1.5 0 7.001 7.001 0 0012.193 4.693l1.38 1.38a.25.25 0 00.427-.177V10.25a.25.25 0 00-.25-.25h-3.646a.25.25 0 00-.177.427l1.204 1.204A5.5 5.5 0 012.5 8z" />
        </svg>
      </button>
    </Tooltip>
  );
}

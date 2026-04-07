"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShareAction } from "@/app/repos/[owner]/[repo]/share-actions";

export function DeleteShareButton({ shareId }: { shareId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        startTransition(async () => {
          await deleteShareAction(shareId);
          router.refresh();
        });
      }}
      disabled={isPending}
      className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
    >
      {isPending ? "..." : "Delete"}
    </button>
  );
}

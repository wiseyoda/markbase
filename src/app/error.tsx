"use client";

import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center">
        <span
          className="text-8xl font-bold"
          style={{ color: "rgba(134, 213, 244, 0.2)" }}
        >
          !
        </span>
        <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
        {process.env.NODE_ENV === "development" && (
          <p className="mt-2 max-w-md text-center font-mono text-xs text-red-500">
            {error.message}
          </p>
        )}
        <p className="mt-2 max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
          An unexpected error occurred. Please try again or return to the
          dashboard.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

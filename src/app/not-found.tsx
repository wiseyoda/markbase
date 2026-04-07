import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center">
        <span
          className="text-8xl font-bold"
          style={{ color: "rgba(134, 213, 244, 0.2)" }}
        >
          404
        </span>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Device authorized",
};

interface DeviceDonePageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  expired:
    "This device code has expired or was already used. Return to your terminal and start the login again.",
};

export default async function DeviceDonePage({ searchParams }: DeviceDonePageProps) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const message = error
    ? ERROR_MESSAGES[error] ?? "Device authorization failed. Return to your terminal and try again."
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <Logo size={24} />
          markbase
        </Link>
        <ThemeToggle />
      </header>

      <main id="main-content" className="mx-auto w-full max-w-md flex-1 px-6 py-10 sm:px-8 sm:py-16">
        <p className="text-sm font-medium text-sky-600 dark:text-[#86D5F4]">MCP access</p>
        {message ? (
          <>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Something went wrong</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{message}</p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Device authorized</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              You can return to your terminal. The waiting client will pick up its tokens on its next poll.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

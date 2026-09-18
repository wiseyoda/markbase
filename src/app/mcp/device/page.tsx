import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Connect a device",
  description: "Enter the code shown in your terminal to authorize an MCP client.",
};

interface DevicePageProps {
  searchParams: Promise<{ user_code?: string | string[] }>;
}

export default async function DevicePage({ searchParams }: DevicePageProps) {
  const params = await searchParams;
  const initial = Array.isArray(params.user_code)
    ? params.user_code[0]
    : params.user_code;

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
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Connect a device</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Enter the code shown in your terminal. You will be asked to confirm with GitHub, and the waiting client receives its tokens automatically.
        </p>

        <form action="/api/mcp/device/verify" method="get" className="mt-8 space-y-4">
          <label htmlFor="user_code" className="block text-sm font-medium">
            Device code
          </label>
          <input
            id="user_code"
            name="user_code"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            defaultValue={initial ?? ""}
            placeholder="XXXX-XXXX"
            className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-lg uppercase tracking-widest text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Continue with GitHub
          </button>
        </form>
      </main>
    </div>
  );
}

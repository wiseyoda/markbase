import type { Metadata } from "next";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Shared links",
};
import { redirect } from "next/navigation";
import Link from "next/link";
import { listShares } from "@/lib/shares";
import { withDbRetry } from "@/lib/db";
import { ShareItem } from "@/components/share-item";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

export default async function SharesPage() {
  const session = await auth();
  if (!session) redirect("/");
  const userId = session.user?.id;
  if (!userId) redirect("/");

  const shares = await withDbRetry(() => listShares(userId));

  // Group by repo
  const byRepo = new Map<string, typeof shares>();
  for (const share of shares) {
    const list = byRepo.get(share.repo) || [];
    list.push(share);
    byRepo.set(share.repo, list);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 sm:px-6 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
            <Logo size={24} />
            markbase
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Shared links
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
        {shares.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 dark:text-zinc-400">
            No shared links yet. Share a file or repo from the viewer.
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {Array.from(byRepo.entries()).map(([repoName, repoShares]) => (
              <section key={repoName}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {repoName}
                  </h3>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {repoShares.length} share{repoShares.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {repoShares.map((share) => (
                    <ShareItem key={share.id} share={share} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

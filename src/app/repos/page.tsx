import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSyncedRepos } from "@/lib/synced-repos";

export default async function ReposPage() {
  const session = await auth();
  if (!session) redirect("/");

  const syncedRepos = await getSyncedRepos();

  if (syncedRepos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            No repos synced yet.
          </p>
          <Link
            href="/dashboard"
            className="text-sm font-medium underline"
          >
            Go to dashboard to sync repos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/dashboard" className="text-lg font-semibold">
          markbase
        </Link>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {syncedRepos.length} synced{" "}
          {syncedRepos.length === 1 ? "repo" : "repos"}
        </span>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <h2 className="mb-6 text-xl font-semibold">Synced repositories</h2>
        <div className="flex flex-col gap-2">
          {syncedRepos.map((fullName) => {
            const [owner, repo] = fullName.split("/");
            return (
              <Link
                key={fullName}
                href={`/repos/${owner}/${repo}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-5 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400 dark:text-zinc-500">
                    {owner}/
                  </span>
                  <span className="font-medium">{repo}</span>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="text-zinc-400"
                >
                  <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
                </svg>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

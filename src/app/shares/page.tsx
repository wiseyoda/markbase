import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listShares } from "@/lib/shares";
import { DeleteShareButton } from "./delete-button";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "Never";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h left";
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export default async function SharesPage() {
  const session = await auth();
  if (!session) redirect("/");
  const userId = session.user?.id;
  if (!userId) redirect("/");

  const shares = await listShares(userId);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-lg font-semibold">
            markbase
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Shared links
          </span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          ← Dashboard
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        {shares.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 dark:text-zinc-400">
            No shared links yet. Share a file or repo from the viewer.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {shares.map((share) => (
              <div
                key={share.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {share.type}
                    </span>
                    <span className="text-sm font-medium">
                      {share.repo}
                      {share.file_path && (
                        <span className="text-zinc-400">
                          /{share.file_path}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                    <span>Created {timeAgo(share.created_at)}</span>
                    <span>·</span>
                    <span>Expires: {expiryLabel(share.expires_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/s/${share.id}`}
                    target="_blank"
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Open
                  </Link>
                  <DeleteShareButton shareId={share.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

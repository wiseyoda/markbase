import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDefaultBranch, getMarkdownTree } from "@/lib/github";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoIndexPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { owner, repo } = await params;
  const branch = await getDefaultBranch(session.accessToken, owner, repo);
  const files = await getMarkdownTree(session.accessToken, owner, repo, branch);

  // Redirect to README.md if it exists, otherwise first .md file
  const readme = files.find(
    (f) => f.path.toLowerCase() === "readme.md",
  );
  const target = readme || files[0];

  if (target) {
    redirect(`/repos/${owner}/${repo}/${target.path}`);
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        {/* Document icon */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800/80">
          <svg
            width="28"
            height="28"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="text-zinc-400 dark:text-zinc-500"
          >
            <path d="M3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v9.086A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75z" />
          </svg>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
            No markdown files yet
          </h2>
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Add <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-medium text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400">.md</code> files
            to this repo and they&#39;ll appear here automatically.
          </p>
        </div>

        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Open on GitHub
        </a>
      </div>
    </div>
  );
}

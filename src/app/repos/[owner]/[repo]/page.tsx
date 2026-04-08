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
      <p className="text-zinc-500 dark:text-zinc-400">
        No markdown files found in this repo.
      </p>
    </div>
  );
}

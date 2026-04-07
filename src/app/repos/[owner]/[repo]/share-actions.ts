"use server";

import { auth } from "@/auth";
import { createShare, deleteShare } from "@/lib/shares";

export async function createShareAction(opts: {
  type: "file" | "repo";
  repo: string;
  branch: string;
  filePath: string | null;
  expiresIn: string | null;
}): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  return createShare({
    type: opts.type,
    ownerId: session.user.id,
    repo: opts.repo,
    branch: opts.branch,
    filePath: opts.filePath,
    accessToken: session.accessToken,
    expiresIn: opts.expiresIn,
  });
}

export async function deleteShareAction(shareId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  return deleteShare(shareId, session.user.id);
}

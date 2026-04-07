"use server";

import { auth } from "@/auth";
import { getDb } from "./db";

async function getUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export async function getSyncedRepos(): Promise<string[]> {
  const userId = await getUserId();
  const db = getDb();
  const rows = await db`
    SELECT repo FROM synced_repos
    WHERE user_id = ${userId}
    ORDER BY synced_at DESC
  `;
  return rows.map((r) => r.repo as string);
}

export async function isSynced(fullName: string): Promise<boolean> {
  const repos = await getSyncedRepos();
  return repos.includes(fullName);
}

export async function toggleSyncRepo(fullName: string): Promise<boolean> {
  const userId = await getUserId();
  const db = getDb();

  // Check if already synced
  const existing = await db`
    SELECT 1 FROM synced_repos
    WHERE user_id = ${userId} AND repo = ${fullName}
  `;

  if (existing.length > 0) {
    await db`
      DELETE FROM synced_repos
      WHERE user_id = ${userId} AND repo = ${fullName}
    `;
    return false; // removed
  }

  await db`
    INSERT INTO synced_repos (user_id, repo)
    VALUES (${userId}, ${fullName})
  `;
  return true; // added
}

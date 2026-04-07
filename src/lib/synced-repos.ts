"use server";

import { cookies } from "next/headers";

const COOKIE_NAME = "synced_repos";

export async function getSyncedRepos(): Promise<string[]> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return [];
  try {
    return JSON.parse(cookie.value);
  } catch {
    return [];
  }
}

export async function isSynced(fullName: string): Promise<boolean> {
  const repos = await getSyncedRepos();
  return repos.includes(fullName);
}

export async function toggleSyncRepo(fullName: string): Promise<boolean> {
  const repos = await getSyncedRepos();
  const index = repos.indexOf(fullName);

  if (index >= 0) {
    repos.splice(index, 1);
  } else {
    repos.push(fullName);
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(repos), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return index < 0; // true if added, false if removed
}

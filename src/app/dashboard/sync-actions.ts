"use server";

import { toggleSyncRepo as toggleSyncRepoInDb } from "@/lib/synced-repos";

/**
 * The only server action for synced repos. The data layer in src/lib is
 * server-only and must never be registered as an action itself: every export
 * of a "use server" module becomes a public POST endpoint.
 */
export async function toggleSyncRepo(fullName: string): Promise<boolean> {
  return toggleSyncRepoInDb(fullName);
}

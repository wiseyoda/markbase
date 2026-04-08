import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRepos, getUsername, groupRepos } from "@/lib/dashboard";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [repos, username] = await Promise.all([
    getRepos(session.accessToken),
    getUsername(session.accessToken),
  ]);

  const groups = groupRepos(repos, username);

  return NextResponse.json({ groups, totalCount: repos.length });
}

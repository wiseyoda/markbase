import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { advanceFileView } from "@/lib/change-digest";

/**
 * POST /api/file-view
 *
 * Advances the user's file_views baseline to a specific (commit, blob) pair.
 * Called when the user explicitly dismisses the change-digest banner — the
 * only signal we treat as "I have seen this version". Page loads alone do
 * not advance the baseline, so refreshes keep the banner visible until the
 * user explicitly acknowledges it.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    owner?: unknown;
    repo?: unknown;
    path?: unknown;
    commitSha?: unknown;
    blobSha?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const owner = typeof body.owner === "string" ? body.owner : null;
  const repo = typeof body.repo === "string" ? body.repo : null;
  const filePath = typeof body.path === "string" ? body.path : null;
  const commitSha = typeof body.commitSha === "string" ? body.commitSha : null;
  const blobSha = typeof body.blobSha === "string" ? body.blobSha : null;

  if (!owner || !repo || !filePath || !commitSha || !blobSha) {
    return NextResponse.json(
      { error: "owner, repo, path, commitSha, and blobSha are required" },
      { status: 400 },
    );
  }

  await advanceFileView({
    userId: session.user.id,
    owner,
    repo,
    filePath,
    commitSha,
    blobSha,
  });

  return NextResponse.json({ ok: true });
}

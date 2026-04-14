import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getDefaultBranch, getFileAtCommit, getFileContent, getFileHistory } from "@/lib/github";
import { computeBlobSha, getFileSummary } from "@/lib/file-summaries";
import { getFileViewBaseline } from "@/lib/change-digest";
import { diffSectionHashes, extractSectionHashes } from "@/lib/section-hashes";
import { getDb, withDbRetry } from "@/lib/db";

/**
 * Dev-only diagnostic. Runs the exact same SSR trace the viewer page does
 * and returns every intermediate value as JSON so we can see which step
 * fails without needing the dev server's stdout.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const filePath = params.get("path");
  if (!owner || !repo || !filePath) {
    return NextResponse.json({ error: "owner, repo, path required" }, { status: 400 });
  }

  const trace: Record<string, unknown> = { owner, repo, filePath };

  const session = await auth();

  // ?wipe=1 resets the user's baseline for this file (dev-only short-circuit)
  if (params.get("wipe") === "1" && session?.user?.id) {
    await withDbRetry(() => getDb()`
      DELETE FROM file_views
      WHERE user_id = ${session.user.id}
        AND owner = ${owner}
        AND repo = ${repo}
        AND file_path = ${filePath}
    `);
    trace.wiped = true;
  }

  trace.session = {
    present: Boolean(session),
    hasAccessToken: Boolean(session?.accessToken),
    userId: session?.user?.id ?? null,
    userLogin: session?.user?.login ?? null,
  };
  if (!session?.accessToken) {
    return NextResponse.json(trace);
  }

  try {
    const branch = await getDefaultBranch(session.accessToken, owner, repo);
    trace.branch = branch;

    const rawContent = await getFileContent(session.accessToken, owner, repo, branch, filePath);
    trace.contentLength = rawContent?.length ?? null;

    if (rawContent !== null) {
      const blobSha = computeBlobSha(rawContent);
      trace.blobSha = blobSha;

      const cachedSummary = await withDbRetry(() =>
        getFileSummary({ owner, repo, filePath, blobSha }),
      ).catch((e) => {
        trace.cachedSummaryError = (e as Error).message;
        return null;
      });
      trace.cachedSummaryPresent = Boolean(cachedSummary);
    }

    const userId = session.user?.id ?? null;
    trace.userId = userId;

    let history: Awaited<ReturnType<typeof getFileHistory>> = [];
    if (userId) {
      try {
        history = await getFileHistory(session.accessToken, owner, repo, branch, filePath);
      } catch (err) {
        trace.getFileHistoryError = (err as Error).message;
      }
    }
    trace.historyLength = history.length;
    trace.historyFirstSha = history[0]?.sha ?? null;

    if (userId && history[0]) {
      try {
        const baseline = await getFileViewBaseline({
          userId,
          owner,
          repo,
          filePath,
        });
        trace.baseline = baseline;
      } catch (err) {
        trace.baselineError = (err as Error).message;
      }
    }

    // Section hash comparison: current vs parent commit content.
    if (rawContent !== null && history.length > 1) {
      const parentSha = history[1].sha;
      trace.parentCommitSha = parentSha;
      const parentContent = await getFileAtCommit(
        session.accessToken,
        owner,
        repo,
        parentSha,
        filePath,
      ).catch((e) => {
        trace.parentContentError = (e as Error).message;
        return null;
      });
      trace.parentContentLength = parentContent?.length ?? null;
      if (parentContent !== null) {
        const parentHashes = extractSectionHashes(parentContent);
        const currentHashes = extractSectionHashes(rawContent);
        trace.parentSectionCount = parentHashes.length;
        trace.currentSectionCount = currentHashes.length;
        trace.parentSectionSlugs = parentHashes.map((s) => s.slug);
        trace.currentSectionSlugs = currentHashes.map((s) => s.slug);
        const diff = diffSectionHashes(parentHashes, currentHashes);
        trace.sectionDiff = diff;
      }
    }

    return NextResponse.json(trace, { status: 200 });
  } catch (err) {
    trace.topLevelError = (err as Error).message;
    trace.topLevelStack = (err as Error).stack;
    return NextResponse.json(trace, { status: 500 });
  }
}

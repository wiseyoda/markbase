import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getFileContent, getRepositoryMetadata } from "@/lib/github";
import { getShare } from "@/lib/shares";
import { withDbRetry } from "@/lib/db";
import { computeBlobSha, getOrCreateFileSummary } from "@/lib/file-summaries";
import { getAiStatus } from "@/lib/ai";

interface SummaryResponseBody {
  enabled: boolean;
  summary: {
    text: string;
    provider: string;
    model: string;
    createdAt: string;
  } | null;
  reason?: string;
}

function respond(body: SummaryResponseBody, status = 200) {
  return NextResponse.json(body, { status });
}

function privateRepositorySummariesEnabled(): boolean {
  return process.env.AI_PRIVATE_REPO_SUMMARIES_ENABLED === "true";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const filePath = params.get("path");
  const shareId = params.get("shareId");

  if (!owner || !repo || !filePath) {
    return NextResponse.json(
      { error: "owner, repo, and path query params are required" },
      { status: 400 },
    );
  }

  const aiStatus = getAiStatus();
  if (!aiStatus.enabled) {
    return respond({ enabled: false, summary: null, reason: aiStatus.reason });
  }

  let accessToken: string | null = null;
  let branch: string | null = null;
  let snapshotContent: string | null = null;
  let repositoryPrivate: boolean | null = null;

  if (shareId) {
    const share = await withDbRetry(() => getShare(shareId));
    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    if (share.repo !== `${owner}/${repo}`) {
      return NextResponse.json({ error: "Share mismatch" }, { status: 403 });
    }
    // Folder shares scope access to a subtree; enforce path prefix.
    if (share.type === "folder" && share.file_path) {
      const scope = share.file_path.replace(/\/$/, "");
      if (filePath !== scope && !filePath.startsWith(`${scope}/`)) {
        return NextResponse.json({ error: "Path out of share scope" }, { status: 403 });
      }
    }
    if (share.type === "file" && share.file_path && share.file_path !== filePath) {
      return NextResponse.json({ error: "Path out of share scope" }, { status: 403 });
    }
    // Private shares must be accessed by the target user.
    if (share.shared_with) {
      const session = await auth();
      if (!session?.user?.id || session.user.id !== share.shared_with) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    accessToken = share.accessToken;
    branch = share.branch;
    snapshotContent = share.snapshotContent;
    repositoryPrivate = share.repo_private;
  } else {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    accessToken = session.accessToken;
    const metadata = await getRepositoryMetadata(accessToken, owner, repo);
    if (!metadata) {
      return NextResponse.json(
        { error: "Repository access could not be verified" },
        { status: 502 },
      );
    }
    branch = metadata.defaultBranch;
    repositoryPrivate = metadata.private;
  }

  if (repositoryPrivate !== false && !privateRepositorySummariesEnabled()) {
    return respond({
      enabled: false,
      summary: null,
      reason: "private repository summaries require explicit operator opt-in",
    });
  }

  const content = snapshotContent ?? (
    accessToken
      ? await getFileContent(accessToken, owner, repo, branch, filePath)
      : null
  );
  if (content === null) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const blobSha = computeBlobSha(content);
  const summary = await getOrCreateFileSummary({
    owner,
    repo,
    filePath,
    blobSha,
    content,
  });

  if (!summary) {
    return respond({
      enabled: true,
      summary: null,
      reason: "generation skipped or failed",
    });
  }

  return respond({
    enabled: true,
    summary: {
      text: summary.summary,
      provider: summary.provider,
      model: summary.model,
      createdAt: summary.createdAt.toISOString(),
    },
  });
}

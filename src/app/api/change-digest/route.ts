import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getDefaultBranch } from "@/lib/github";
import { assembleChangeDigest, type ChangeDigest } from "@/lib/change-digest";
import { getAiStatus } from "@/lib/ai";

interface ChangeDigestResponseBody {
  enabled: boolean;
  digest: ChangeDigest | null;
  reason?: string;
}

function respond(body: ChangeDigestResponseBody, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const filePath = params.get("path");
  const fromCommitSha = params.get("from") || null;
  const toCommitSha = params.get("to");

  if (!owner || !repo || !filePath || !toCommitSha) {
    return NextResponse.json(
      { error: "owner, repo, path, and to query params are required" },
      { status: 400 },
    );
  }

  const aiStatus = getAiStatus();
  if (!aiStatus.enabled) {
    return respond({ enabled: false, digest: null, reason: aiStatus.reason });
  }

  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const branch = await getDefaultBranch(session.accessToken, owner, repo);
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[api/change-digest] ${filePath} from=${fromCommitSha ?? "null"} to=${toCommitSha}`,
    );
  }
  let digest: Awaited<ReturnType<typeof assembleChangeDigest>> = null;
  try {
    digest = await assembleChangeDigest({
      accessToken: session.accessToken,
      owner,
      repo,
      branch,
      filePath,
      fromCommitSha,
      toCommitSha,
    });
  } catch (err) {
    console.warn(`[api/change-digest] assemble failed:`, err);
  }
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[api/change-digest] result: bullets=${digest?.bullets.length ?? 0} isFirstView=${digest?.isFirstView ?? false}`,
    );
  }

  return respond({ enabled: true, digest });
}

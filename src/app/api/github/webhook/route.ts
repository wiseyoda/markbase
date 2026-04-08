import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { expireGitHubBranchCache } from "@/lib/github-cache";

export const runtime = "nodejs";

interface GitHubPushEvent {
  ref?: string;
  repository?: {
    full_name?: string;
  };
}

function isValidGitHubSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "GitHub webhook secret is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing GitHub webhook signature" },
      { status: 401 },
    );
  }

  const payload = await request.text();
  if (!isValidGitHubSignature(payload, signature, secret)) {
    return NextResponse.json(
      { error: "Invalid GitHub webhook signature" },
      { status: 401 },
    );
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    return NextResponse.json({ ok: true });
  }

  if (event !== "push") {
    return NextResponse.json(
      { ignored: true, reason: "Unsupported event" },
      { status: 202 },
    );
  }

  let data: GitHubPushEvent;
  try {
    data = JSON.parse(payload) as GitHubPushEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const fullName = data.repository?.full_name;
  const ref = data.ref;
  if (!fullName || !ref) {
    return NextResponse.json(
      { error: "Missing repository or ref" },
      { status: 400 },
    );
  }

  if (!ref.startsWith("refs/heads/")) {
    return NextResponse.json(
      { ignored: true, reason: "Not a branch push" },
      { status: 202 },
    );
  }

  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Invalid repository name" },
      { status: 400 },
    );
  }

  const branch = ref.slice("refs/heads/".length);
  expireGitHubBranchCache(owner, repo, branch);

  return NextResponse.json({ ok: true, repo: fullName, branch });
}

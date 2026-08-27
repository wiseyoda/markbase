import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, initDb } from "@/lib/db";

function testModeOnly(request: NextRequest) {
  const expected = process.env.MARKBASE_TEST_SECRET;
  const provided = request.headers.get("x-markbase-test-secret");
  if (!expected || expected.length < 32 || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return false;
  }
  return (
    process.env.MARKBASE_TEST_MODE === "true" &&
    process.env.VERCEL_ENV !== "production"
  );
}

export async function POST(request: NextRequest) {
  if (!testModeOnly(request)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await initDb();
      const db = getDb();
      await db`
        TRUNCATE TABLE comments, shares, synced_repos, users
        RESTART IDENTITY CASCADE
      `;
      return NextResponse.json({ ok: true });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return NextResponse.json(
    { error: String(lastError || "reset_failed") },
    { status: 500 },
  );
}

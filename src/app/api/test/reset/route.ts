import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";

function testModeOnly() {
  return process.env.MARKBASE_TEST_MODE === "true";
}

export async function POST() {
  if (!testModeOnly()) {
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

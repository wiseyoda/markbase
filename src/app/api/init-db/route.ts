import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[init-db] Database initialization failed:", error);
    return NextResponse.json(
      { error: "Database initialization failed" },
      { status: 500 },
    );
  }
}

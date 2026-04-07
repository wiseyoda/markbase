import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const url = process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL || "(none)";
    const redacted = url.replace(/\/\/[^@]+@/, "//***@");
    return NextResponse.json(
      { error: String(error), url_host: redacted },
      { status: 500 },
    );
  }
}

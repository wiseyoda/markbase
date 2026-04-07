import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Skip auth middleware in bypass mode
  if (
    process.env.AUTH_BYPASS === "true" &&
    process.env.NODE_ENV === "development"
  ) {
    return NextResponse.next();
  }

  // @ts-expect-error — auth returns middleware-compatible handler
  return auth(request);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};

import { authMiddleware } from "@/auth";

export const proxy = authMiddleware;

export const config = {
  matcher: ["/dashboard/:path*"],
};

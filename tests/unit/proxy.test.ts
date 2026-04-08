import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  authMiddleware: vi.fn(),
}));

describe("proxy", async () => {
  const { config, proxy } = await import("@/proxy");
  const { authMiddleware } = await import("@/auth");

  it("re-exports the auth middleware and matcher", () => {
    expect(proxy).toBe(authMiddleware);
    expect(config).toEqual({
      matcher: ["/dashboard/:path*"],
    });
  });
});

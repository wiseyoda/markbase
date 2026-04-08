// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyMcpTokenMock = vi.fn();
const getToolsListMock = vi.fn();
const executeToolMock = vi.fn();

vi.mock("@/lib/mcp/jwt", () => ({
  verifyMcpToken: verifyMcpTokenMock,
}));

vi.mock("@/lib/mcp/tools", () => ({
  getToolsList: getToolsListMock,
  executeTool: executeToolMock,
}));

describe("MCP JSON-RPC route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://markbase.test";
    verifyMcpTokenMock.mockResolvedValue({
      sub: "1",
      login: "owner-user",
      name: "Owner User",
      avatar_url: "https://example.com/owner.png",
      github_token: "owner-token",
    });
    getToolsListMock.mockReturnValue([{ name: "get_comments" }]);
    executeToolMock.mockResolvedValue({ ok: true });
  });

  it("rejects unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const request = new NextRequest("https://markbase.test/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "https://markbase.test/.well-known/oauth-protected-resource",
    );

    verifyMcpTokenMock.mockRejectedValueOnce(new Error("invalid"));
    const badBearer = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect(badBearer.status).toBe(401);
  });

  it("handles parse and validation errors", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const parseRequest = new NextRequest("https://markbase.test/api/mcp", {
      method: "POST",
      body: "{",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
    });

    const parseResponse = await POST(parseRequest);
    expect(await parseResponse.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });

    const invalidRequest = new NextRequest("https://markbase.test/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "1.0", id: 1 }),
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
    });
    const invalidResponse = await POST(invalidRequest);
    expect((await invalidResponse.json()).error.code).toBe(-32600);

    const invalidWithoutId = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "1.0" }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await invalidWithoutId.json()).id).toBeNull();
  });

  it("handles initialize, tool listing, tool execution, and notifications", async () => {
    const { POST, GET, DELETE } = await import("@/app/api/mcp/route");

    const initialize = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await initialize.json()).result.protocolVersion).toBe("2025-03-26");

    const list = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await list.json()).result.tools).toEqual([{ name: "get_comments" }]);

    const call = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "get_comments", arguments: { repo: "owner/repo" } },
        }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await call.json()).result.content[0].text).toContain('"ok": true');

    executeToolMock.mockRejectedValueOnce(new Error("boom"));
    const failed = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "get_comments" },
        }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await failed.json()).result.isError).toBe(true);

    executeToolMock.mockRejectedValueOnce("boom");
    const failedString = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "get_comments" },
        }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await failedString.json()).result.content[0].text).toBe(
      "Tool execution failed",
    );

    const missingName = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: {},
        }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await missingName.json()).error.code).toBe(-32602);

    const notification = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize" }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect(notification.status).toBe(202);

    const unknownMethod = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "unknown", id: 1 }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      }),
    );
    expect((await unknownMethod.json()).error.code).toBe(-32601);

    expect((await GET()).status).toBe(405);
    await expect((await DELETE()).json()).resolves.toEqual({ ok: true });
  });

  it("uses the default metadata URL when NEXTAUTH_URL is unset", async () => {
    delete process.env.NEXTAUTH_URL;
    vi.resetModules();
    const { POST } = await import("@/app/api/mcp/route");

    const response = await POST(
      new NextRequest("https://markbase.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.headers.get("WWW-Authenticate")).toContain(
      "https://markbase-github.vercel.app/.well-known/oauth-protected-resource",
    );
  });
});

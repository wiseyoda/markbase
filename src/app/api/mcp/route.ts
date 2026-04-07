import { NextRequest, NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp/jwt";
import { getToolsList, executeTool } from "@/lib/mcp/tools";
import type { McpContext, JsonRpcRequest, JsonRpcResponse } from "@/lib/mcp/types";

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://markbase-github.vercel.app";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "markbase", version: "1.0.0" };

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): NextResponse<JsonRpcResponse> {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function jsonRpcResult(
  id: string | number | null,
  result: unknown,
): NextResponse<JsonRpcResponse> {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function unauthorized(): NextResponse {
  const resourceMetadataUrl = `${BASE_URL}/.well-known/oauth-protected-resource`;
  return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  });
}

async function authenticate(
  req: NextRequest,
): Promise<McpContext | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.slice(7);
    const payload = await verifyMcpToken(token);
    return {
      userId: payload.sub,
      userLogin: payload.login,
      userName: payload.name,
      userAvatar: payload.avatar_url,
      githubToken: payload.github_token,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const context = await authenticate(req);
  if (!context) return unauthorized();

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return jsonRpcError(body.id ?? null, -32600, "Invalid Request");
  }

  const { method, params, id } = body;

  // Notifications (no id) — acknowledge silently
  if (id === undefined) {
    return new NextResponse(null, { status: 202 });
  }

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "tools/list":
      return jsonRpcResult(id, { tools: getToolsList() });

    case "tools/call": {
      const toolName = (params as Record<string, unknown>)?.name as string;
      const toolArgs =
        ((params as Record<string, unknown>)?.arguments as Record<
          string,
          unknown
        >) || {};

      if (!toolName) {
        return jsonRpcError(id, -32602, "Missing tool name");
      }

      try {
        const result = await executeTool(toolName, toolArgs, context);
        return jsonRpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Tool execution failed";
        return jsonRpcResult(id, {
          isError: true,
          content: [{ type: "text", text: message }],
        });
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function GET() {
  // This server is stateless (Vercel) and never sends server-initiated messages.
  // 405 tells MCP clients not to poll for an SSE stream.
  return new NextResponse(null, { status: 405 });
}

export async function DELETE() {
  // Session cleanup — stateless, nothing to clean
  return NextResponse.json({ ok: true });
}

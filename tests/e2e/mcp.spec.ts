import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { resetApp } from "./helpers";

function pkceChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test("completes the MCP OAuth and JSON-RPC flow", async ({ request }) => {
  const register = await request.post("/api/mcp/register", {
    data: {
      client_name: "Playwright MCP",
      redirect_uris: ["https://client.test/callback"],
    },
  });
  expect(register.ok()).toBeTruthy();
  const registration = await register.json();

  const verifier = "verifier";
  const authorize = await request.get(
    `/api/mcp/authorize?response_type=code&client_id=${registration.client_id}&redirect_uri=${encodeURIComponent("https://client.test/callback")}&state=client-state&code_challenge=${pkceChallenge(verifier)}&code_challenge_method=S256`,
    {
      maxRedirects: 0,
    },
  );
  expect(authorize.status()).toBe(302);

  const githubRedirect = authorize.headers()["location"];
  const github = await request.get(githubRedirect, { maxRedirects: 0 });
  expect(github.status()).toBe(302);

  const callbackRedirect = github.headers()["location"];
  const callback = await request.get(callbackRedirect, { maxRedirects: 0 });
  expect(callback.status()).toBe(302);

  const clientRedirect = callback.headers()["location"];
  const callbackUrl = new URL(clientRedirect);
  const code = callbackUrl.searchParams.get("code");

  const token = await request.post("/api/mcp/token", {
    data: {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://client.test/callback",
      client_id: registration.client_id,
      code_verifier: verifier,
    },
  });
  expect(token.ok()).toBeTruthy();
  const tokenBody = await token.json();

  const initialize = await request.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
    },
    data: {
      jsonrpc: "2.0",
      method: "initialize",
      id: 1,
    },
  });
  expect((await initialize.json()).result.protocolVersion).toBe("2025-03-26");

  const tools = await request.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
    },
    data: {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2,
    },
  });
  const listedTools = await tools.json();
  expect(listedTools.result.tools).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "get_comments" })]),
  );

  const getComments = await request.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
    },
    data: {
      jsonrpc: "2.0",
      method: "tools/call",
      id: 3,
      params: {
        name: "get_comments",
        arguments: {
          repo: "owner-user/notes",
          branch: "main",
          path: "README.md",
        },
      },
    },
  });
  const toolCall = await getComments.json();
  expect(toolCall.result.content[0].text).toContain('"comments": []');
});

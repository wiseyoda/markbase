/** Context passed to every MCP tool execution */
export interface McpContext {
  userId: string;
  userLogin: string;
  userName: string;
  userAvatar: string;
  githubToken: string;
  grantId?: string;
}

/** JWT payload stored in MCP access tokens */
export interface McpJwtPayload {
  sub: string;
  grant_id: string;
  token_version: number;
}

/** OAuth state encrypted into the GitHub redirect */
export interface OAuthState {
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  client_id: string;
  client_state: string;
  /** Set when the browser approval belongs to an RFC 8628 device flow */
  device_user_code?: string;
}

/** Auth code payload encrypted into the one-time code */
export interface AuthCodePayload {
  github_access_token: string;
  github_token_expires_at?: number;
  github_refresh_token?: string;
  github_refresh_token_expires_at?: number;
  github_user_id: string;
  github_login: string;
  github_name: string;
  github_avatar: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  client_id: string;
  expires_at: number; // Unix timestamp (ms)
}

/** JSON-RPC 2.0 request */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

/** JSON-RPC 2.0 response */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** MCP tool definition */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context: McpContext,
  ) => Promise<unknown>;
}

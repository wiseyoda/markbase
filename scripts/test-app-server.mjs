import http from "node:http";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { GenericContainer, Wait } from "testcontainers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const appPort = 3101;
const envFile = resolve(rootDir, ".e2e-test-env.json");
const githubFixture = JSON.parse(
  await readFile(resolve(rootDir, "tests/fixtures/mock-github.json"), "utf8"),
);

const githubPort = 4100;
let githubServer;
let nextProcess;
let pgContainer;
let postgresUrl;

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function text(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function resolveToken(request) {
  const authHeader = request.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "owner-token";
}

function getUserForToken(token) {
  return githubFixture.users[token] || githubFixture.users["owner-token"];
}

function makeKey(owner, repo, ref, path) {
  return `${owner}/${repo}@${ref}:${path}`;
}

async function startGitHubServer() {
  githubServer = http.createServer((request, response) => {
    const url = new URL(request.url || "/", `http://127.0.0.1:${githubPort}`);

    if (request.method === "GET" && url.pathname === "/login/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      const destination = new URL(redirectUri);
      destination.searchParams.set("code", "mock-oauth-code");
      if (state) destination.searchParams.set("state", state);
      response.writeHead(302, { Location: destination.toString() });
      response.end();
      return;
    }

    if (request.method === "POST" && url.pathname === "/login/oauth/access_token") {
      json(response, 200, { access_token: "oauth-access-token", token_type: "bearer" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/user") {
      json(response, 200, getUserForToken(resolveToken(request)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/user/repos") {
      json(response, 200, githubFixture.repos);
      return;
    }

    if (request.method === "GET" && url.pathname === "/search/users") {
      json(response, 200, { items: githubFixture.searchUsers });
      return;
    }

    const repoMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
    if (request.method === "GET" && repoMatch) {
      const [, owner, repo] = repoMatch;
      const match = githubFixture.repos.find(
        (item) => item.full_name === `${owner}/${repo}`,
      );
      if (!match) {
        json(response, 404, { error: "not found" });
        return;
      }
      json(response, 200, { default_branch: match.default_branch });
      return;
    }

    const treeMatch = url.pathname.match(
      /^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/([^/]+)$/,
    );
    if (request.method === "GET" && treeMatch) {
      const [, owner, repo, branch] = treeMatch;
      const tree = githubFixture.trees[`${owner}/${repo}@${branch}`] || [];
      json(response, 200, { tree });
      return;
    }

    const commitsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/commits$/);
    if (request.method === "GET" && commitsMatch) {
      const [, owner, repo] = commitsMatch;
      const branch = url.searchParams.get("sha") || "main";
      const path = url.searchParams.get("path") || "";
      const commits = githubFixture.commits[makeKey(owner, repo, branch, path)] || [];
      const perPage = Number(url.searchParams.get("per_page") || commits.length || 30);
      json(response, 200, commits.slice(0, perPage));
      return;
    }

    const contentsMatch = url.pathname.match(
      /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/,
    );
    if (request.method === "GET" && contentsMatch) {
      const [, owner, repo, path] = contentsMatch;
      const ref = url.searchParams.get("ref") || "main";
      const key = makeKey(owner, repo, ref, decodeURIComponent(path));
      if (!(key in githubFixture.contents)) {
        json(response, 404, { error: "not found" });
        return;
      }
      text(response, 200, githubFixture.contents[key]);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/raw/")) {
      text(response, 200, "binary");
      return;
    }

    json(response, 404, { error: "not found" });
  });

  await new Promise((resolvePromise) => {
    githubServer.listen(githubPort, "127.0.0.1", resolvePromise);
  });
}

async function startPostgres() {
  pgContainer = await new GenericContainer("postgres:16-alpine")
    .withEnvironment({
      POSTGRES_DB: "markbase",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "postgres",
    })
    .withExposedPorts(5432)
      .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections"),
    )
    .start();

  postgresUrl =
    `postgres://postgres:postgres@127.0.0.1:${pgContainer.getMappedPort(5432)}/markbase`;

  for (let attempt = 0; attempt < 10; attempt++) {
    let sql;
    try {
      sql = postgres(postgresUrl, {
        ssl: false,
        max: 1,
        idle_timeout: 1,
        connect_timeout: 5,
        prepare: false,
      });
      await sql`select 1`;
      await sql.end({ timeout: 1 });
      return;
    } catch {
      if (sql) {
        await sql.end({ timeout: 1 }).catch(() => {});
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }

  throw new Error("Postgres did not become ready in time");
}

async function initializeDatabase() {
  const sql = postgres(postgresUrl, {
    ssl: false,
    max: 1,
    connect_timeout: 5,
    prepare: false,
  });

  await sql`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('file', 'repo', 'folder')),
      owner_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      file_path TEXT,
      access_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      shared_with TEXT,
      shared_with_name TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      file_key TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      quote TEXT,
      quote_context TEXT,
      body TEXT NOT NULL,
      parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS synced_repos (
      user_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, repo)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      name TEXT,
      avatar_url TEXT,
      last_login TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql.end({ timeout: 1 });
}

async function startNext() {
  const env = {
    ...process.env,
    PORT: String(appPort),
    NEXTAUTH_URL: `http://127.0.0.1:${appPort}`,
    AUTH_TRUST_HOST: "true",
    MARKBASE_TEST_MODE: "true",
    POSTGRES_URL: postgresUrl,
    PRISMA_DATABASE_URL: postgresUrl,
    POSTGRES_SSL: "false",
    GITHUB_ID: "test-client-id",
    GITHUB_SECRET: "test-client-secret",
    GITHUB_API_BASE_URL: `http://127.0.0.1:${githubPort}`,
    GITHUB_WEB_BASE_URL: `http://127.0.0.1:${githubPort}`,
    GITHUB_RAW_BASE_URL: `http://127.0.0.1:${githubPort}/raw`,
    SHARE_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };

  nextProcess = spawn("pnpm", ["start"], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
}

async function waitForAppAndDatabase() {
  const baseUrl = `http://127.0.0.1:${appPort}`;

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/test/reset`, {
        method: "POST",
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error("Next.js server did not become DB-ready in time");
}

async function cleanup() {
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill("SIGTERM");
  }

  if (githubServer) {
    await new Promise((resolvePromise) => githubServer.close(resolvePromise));
  }

  if (pgContainer) {
    await pgContainer.stop();
  }

  await unlink(envFile).catch(() => {});
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

await startGitHubServer();
await startPostgres();
await initializeDatabase();
await writeFile(
  envFile,
  JSON.stringify({
    postgresUrl,
  }),
  "utf8",
);
await startNext();
await waitForAppAndDatabase();

await new Promise((resolvePromise, reject) => {
  nextProcess.on("exit", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`next start exited with code ${code}`));
  });
});

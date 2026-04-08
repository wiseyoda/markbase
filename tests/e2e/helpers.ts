import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { encodeTestAuthCookie, TEST_AUTH_COOKIE, type TestAuthPayload } from "@/lib/test-auth";

export const ownerUser: TestAuthPayload = {
  id: "101",
  login: "owner-user",
  name: "Owner User",
  accessToken: "owner-token",
};

export const recipientUser: TestAuthPayload = {
  id: "202",
  login: "recipient-user",
  name: "Recipient User",
  accessToken: "recipient-token",
};

export const otherUser: TestAuthPayload = {
  id: "303",
  login: "other-user",
  name: "Other User",
  accessToken: "other-token",
};

export async function resetApp() {
  const envFile = resolve(process.cwd(), ".e2e-test-env.json");
  const env = JSON.parse(await readFile(envFile, "utf8")) as {
    postgresUrl: string;
  };
  const sql = postgres(env.postgresUrl, {
    ssl: false,
    max: 1,
    connect_timeout: 5,
    prepare: false,
  });
  await sql`
    TRUNCATE TABLE comments, shares, synced_repos, users
    RESTART IDENTITY CASCADE
  `;
  await sql.end({ timeout: 1 });
  expect(true).toBeTruthy();
}

export async function loginAs(page: Page, user: TestAuthPayload) {
  await page.context().addCookies([
    {
      name: TEST_AUTH_COOKIE,
      value: encodeTestAuthCookie(user),
      url: "http://127.0.0.1:3101",
    },
  ]);
}

export async function newLoggedInContext(
  browser: Browser,
  user: TestAuthPayload,
  options?: { viewport?: { width: number; height: number } },
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.addCookies([
    {
      name: TEST_AUTH_COOKIE,
      value: encodeTestAuthCookie(user),
      url: "http://127.0.0.1:3101",
    },
  ]);
  return context;
}

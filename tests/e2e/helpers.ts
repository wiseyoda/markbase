import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
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

export async function resetApp(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/test/reset");
  expect(res.ok()).toBeTruthy();
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

import { expect, test } from "@playwright/test";
import {
  loginAs,
  newLoggedInContext,
  otherUser,
  ownerUser,
  recipientUser,
  resetApp,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test("renders the anonymous landing page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Your markdown deserves better than raw GitHub.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in with github/i }).first(),
  ).toBeVisible();
  await expect(page.getByText(/GitHub's current OAuth scope is broad/i)).toBeVisible();
});

test("publishes trust details without exposing database migration over HTTP", async ({
  page,
  request,
}) => {
  await page.goto("/security");

  await expect(page.getByRole("heading", { name: "Security and data use" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GitHub permissions" })).toBeVisible();
  await expect(page.getByText(/does not commit, push, or modify repository contents/i)).toBeVisible();

  const migrationRoute = await request.get("/api/init-db");
  expect(migrationRoute.status()).toBe(404);
});

test("lets an authenticated user add a repo, browse markdown, inspect history, and open a link share", async ({
  page,
  browser,
}) => {
  await loginAs(page, ownerUser);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Browse repositories" }).click();
  await expect(page.getByRole("heading", { name: "All repositories" })).toBeVisible();
  await page.getByRole("button", { name: "Add" }).first().click();

  await expect(page.getByRole("heading", { name: "Your repos" })).toBeVisible();
  await page.locator('a[href="/repos/owner-user/notes"]').first().click();

  await page.waitForURL(/\/repos\/owner-user\/notes\/README\.md$/);
  await expect(page.locator("article")).toContainText("Welcome");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "File History" })).toBeVisible();
  await page.getByRole("button", { name: /Refine README details/i }).click();
  await expect(page.getByText("Latest detail here.")).toBeVisible();
  await page.getByRole("button", { name: "Diff" }).click();
  const historyDialog = page.getByRole("dialog", { name: "File History" });
  await historyDialog
    .getByRole("button", { name: "Close history panel" })
    .click();
  await expect(historyDialog).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  const filesDialog = page.getByRole("dialog", { name: "Files" });
  if (await filesDialog.isVisible()) {
    await filesDialog.getByRole("button", { name: "Close" }).click();
    await expect(filesDialog).toBeHidden();
  }
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "Add comment" }).click();
  await page.getByPlaceholder("Add a comment...").fill(
    "Authorization boundary verified end to end.",
  );
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(
    page.getByText("Authorization boundary verified end to end."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Comments", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "Create share link" }).click();
  const shareUrl = await page.locator('input[readOnly]').inputValue();
  expect(shareUrl).toContain("/s/");

  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto(shareUrl);
  await expect(anonymousPage.locator("article")).toContainText("Welcome");
  await anonymousContext.close();
});

test("enforces targeted share access", async ({
  page,
  browser,
}) => {
  await loginAs(page, ownerUser);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Browse repositories" }).click();
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByRole("heading", { name: "Your repos" })).toBeVisible();
  await page.locator('a[href="/repos/owner-user/notes"]').first().click();
  await page.waitForURL(/\/repos\/owner-user\/notes\/README\.md$/);

  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "Specific user" }).click();
  await page.getByPlaceholder("Search users...").fill("recipient");
  await page.getByRole("button", { name: "recipient-user" }).click();
  await page.getByRole("button", { name: "Share with user" }).click();
  await expect(
    page.locator("p").filter({ hasText: /Shared with recipient-user/i }),
  ).toBeVisible();

  await page.goto("/shares");
  const targetedShareUrl = await page
    .getByRole("link", { name: "Open" })
    .first()
    .getAttribute("href");

  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto(`http://127.0.0.1:3101${targetedShareUrl}`);
  await expect(
    anonymousPage.getByRole("heading", { name: "Document not found" }),
  ).toBeVisible();
  await anonymousContext.close();

  const otherContext = await newLoggedInContext(browser, otherUser);
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`http://127.0.0.1:3101${targetedShareUrl}`);
  await expect(
    otherPage.getByRole("heading", { name: "Document not found" }),
  ).toBeVisible();
  await otherContext.close();

  const recipientContext = await newLoggedInContext(browser, recipientUser, {
    viewport: { width: 390, height: 844 },
  });
  const recipientPage = await recipientContext.newPage();
  await recipientPage.goto(`http://127.0.0.1:3101${targetedShareUrl}`);
  await expect(recipientPage.locator("article")).toContainText("Welcome");
  await recipientContext.close();
});

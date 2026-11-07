import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "e2e-password-123";
const suffix = Date.now().toString(36).slice(-6);

async function register(browser: Browser, username: string, displayName: string, next?: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(next ? `/register?next=${encodeURIComponent(next)}` : "/register");
  await page.getByLabel("Username").fill(username);
  await expect(page.getByText("Available")).toBeVisible();
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  return page;
}

async function sendMessage(page: Page, text: string) {
  const box = page.getByLabel(/^Message /);
  await box.fill(text);
  await box.press("Enter");
}

test("two people pair by username, chat in real time, and disconnect", async ({ browser }) => {
  const maya = `maya_${suffix}`;
  const alex = `alex_${suffix}`;

  const a = await register(browser, maya, "Maya");
  await expect(a).toHaveURL(/\/onboarding/);
  await a.getByRole("button", { name: "Skip for now" }).click();
  await expect(a).toHaveURL(/\/connect/);

  const b = await register(browser, alex, "Alex");
  await expect(b).toHaveURL(/\/onboarding/);

  // Maya finds Alex by exact username (case-insensitive) and sends a request.
  await a.getByLabel("Partner's username").fill(alex.toUpperCase());
  await a.getByRole("button", { name: "Search" }).click();
  await expect(a.getByText(`@${alex}`)).toBeVisible();
  await a.getByRole("button", { name: "Send request" }).click();
  await expect(a.getByText("Request sent", { exact: true })).toBeVisible();

  // Alex receives it live and accepts.
  await b.goto("/connect");
  await b.getByRole("button", { name: "Accept request from Maya" }).click();
  await expect(b).toHaveURL(/\/chat/);
  await expect(b.getByRole("heading", { name: "Maya" })).toBeVisible();

  // Maya is moved into the chat by the realtime pairing event.
  await expect(a).toHaveURL(/\/chat/, { timeout: 15_000 });
  await expect(a.getByRole("heading", { name: "Alex" })).toBeVisible();

  // Presence.
  await expect(a.getByText("online", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Typing indicator.
  await b.getByLabel(/^Message /).pressSequentially("typing…");
  await expect(a.getByText("typing…")).toBeVisible();
  await b.getByLabel(/^Message /).fill("");

  // Real-time delivery both ways, with emoji.
  await sendMessage(a, "Hello Alex 👋");
  await expect(b.getByText("Hello Alex 👋")).toBeVisible();
  await sendMessage(b, "Hi Maya! 🌙");
  await expect(a.getByText("Hi Maya! 🌙")).toBeVisible();

  // Read receipt: Alex has the chat open and focused, so Maya's message becomes "Seen".
  await b.bringToFront();
  await expect(a.getByLabel("Seen").first()).toBeVisible({ timeout: 15_000 });

  // Receipts are sent explicitly for later messages too (not only implied by a reply).
  await sendMessage(a, "Saturday morning?");
  await sendMessage(a, "The little bookshop 📚");
  await expect(b.getByText("The little bookshop 📚")).toBeVisible();
  await b.bringToFront();
  await expect(a.getByLabel("Seen")).toHaveCount(3, { timeout: 15_000 });
  await expect(a.getByLabel("Sent", { exact: true })).toHaveCount(0);

  // Read ticks are green.
  const tickColor = await a.getByLabel("Seen").first().locator("svg").evaluate((el) => getComputedStyle(el).color);
  expect(tickColor).toBe("rgb(22, 163, 74)");

  // Reply to a specific message (desktop: hover + reply button).
  await b.getByText("Hello Alex 👋").hover();
  await b.locator('[id^="msg-"]', { hasText: "Hello Alex 👋" }).getByRole("button", { name: "Reply to this message" }).click();
  await expect(b.getByText("Replying to Maya")).toBeVisible();
  await sendMessage(b, "Hello to you too!");
  await expect(b.getByText("Replying to Maya")).toHaveCount(0);
  // Both sides see the quoted original above the reply.
  await expect(a.getByRole("button", { name: /Replying to You: Hello Alex 👋/ })).toBeVisible();
  await expect(b.getByRole("button", { name: /Replying to Maya: Hello Alex 👋/ })).toBeVisible();
  // Tapping the quote highlights the original message.
  await a.getByRole("button", { name: /Replying to You: Hello Alex 👋/ }).click();
  await expect(a.locator('[id^="msg-"]', { hasText: "Hello Alex 👋" }).first().locator(".ring-2")).toHaveCount(1);

  // Persistence: reload and the history is loaded from Postgres.
  await a.reload();
  await expect(a.getByText("Hello Alex 👋").first()).toBeVisible();
  await expect(a.getByText("Hi Maya! 🌙")).toBeVisible();

  // Disconnect with confirmation.
  await a.goto("/settings#partner");
  await a.getByRole("button", { name: "Disconnect from Alex" }).click();
  await a.getByLabel(`Type ${alex} to confirm`).fill(alex);
  await a.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(a).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(a.getByText(/previous couple space ended/)).toBeVisible();

  // Alex loses access too.
  await expect(b).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await b.goto("/chat");
  await expect(b.getByText("No conversation yet")).toBeVisible();
});

test("invitation link pairs a brand-new user and is single-use", async ({ browser }) => {
  const sam = `sam_${suffix}`;
  const a = await register(browser, sam, "Sam");
  await expect(a).toHaveURL(/\/onboarding/);
  await a.goto("/connect");
  await a.getByRole("button", { name: "Create invitation link" }).click();
  const link = await a.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  const path = new URL(link).pathname;

  // A visitor sees who invited them, signs up, and accepts.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(path);
  await expect(visitor.getByRole("heading", { name: "Sam invited you to KindChat" })).toBeVisible();

  const b = await register(browser, `riley_${suffix}`, "Riley", path);
  await expect(b).toHaveURL(new RegExp(path));
  await b.getByRole("button", { name: "Accept and connect with Sam" }).click();
  await expect(b).toHaveURL(/\/chat/);
  await expect(a).toHaveURL(/\/chat/, { timeout: 15_000 });

  // The link cannot be used again.
  await visitor.goto(path);
  await expect(visitor.getByText("This invitation isn't available")).toBeVisible();
});

test("login uses usernames and rejects bad credentials generically", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(`nobody_${suffix}`);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect username or password.")).toBeVisible();
});

test("signed-out visitors are redirected away from the app @mobile", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login\?next=%2Fchat/);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A quieter place for two." })).toBeVisible();
});

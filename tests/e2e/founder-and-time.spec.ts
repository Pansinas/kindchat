import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test";

/**
 * Requires a founder account: set E2E_FOUNDER_USERNAME / E2E_FOUNDER_PASSWORD, after running
 *   select private.set_founder('<username>');
 * on the test database.
 */
const FOUNDER = process.env.E2E_FOUNDER_USERNAME;
const FOUNDER_PASSWORD = process.env.E2E_FOUNDER_PASSWORD;
const PASSWORD = "e2e-password-123";
const suffix = Date.now().toString(36).slice(-6);

async function register(browser: Browser, username: string, displayName: string, options: BrowserContextOptions = {}) {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await expect(page.getByText("Available")).toBeVisible();
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  return page;
}

test("partner local time shows only when the clocks differ", async ({ browser }) => {
  const india = { timezoneId: "Asia/Kolkata" };
  const london = { timezoneId: "Europe/London" };
  const a = await register(browser, `tz_a_${suffix}`, "Asha", india);
  const b = await register(browser, `tz_b_${suffix}`, "Ben", london);
  const c = await register(browser, `tz_c_${suffix}`, "Chitra", india);

  await a.goto("/connect");
  await a.getByLabel("Partner's username").fill(`tz_b_${suffix}`);
  await a.getByRole("button", { name: "Search" }).click();
  await a.getByRole("button", { name: "Send request" }).click();
  await b.goto("/connect");
  await b.getByRole("button", { name: "Accept request from Asha" }).click();
  await expect(b).toHaveURL(/\/chat/);
  await expect(a).toHaveURL(/\/chat/, { timeout: 15_000 });

  // Different clocks: each sees the other's local time.
  await a.reload();
  await expect(a.getByText(/for Ben$/).filter({ visible: true })).toBeVisible();
  await b.reload();
  await expect(b.getByText(/for Asha$/).filter({ visible: true })).toBeVisible();

  // Same clock (Asha and Chitra are both in India): nothing is shown.
  await c.goto("/connect");
  await c.getByLabel("Partner's username").fill(`tz_d_${suffix}`);
  const d = await register(browser, `tz_d_${suffix}`, "Dev", india);
  await c.getByRole("button", { name: "Search" }).click();
  await c.getByRole("button", { name: "Send request" }).click();
  await d.goto("/connect");
  await d.getByRole("button", { name: "Accept request from Chitra" }).click();
  await expect(d).toHaveURL(/\/chat/);
  await d.reload();
  await expect(d.getByRole("heading", { name: "Chitra" })).toBeVisible();
  await expect(d.getByText(/for Chitra$/)).toHaveCount(0);
});

test("founder greets new users, users can reply, founder can message anyone", async ({ browser }) => {
  test.skip(!FOUNDER || !FOUNDER_PASSWORD, "Set E2E_FOUNDER_USERNAME and E2E_FOUNDER_PASSWORD");

  // A brand-new user is greeted automatically.
  const user = await register(browser, `fan_${suffix}`, "Fan");
  await user.goto("/dashboard");
  await expect(user.getByText("1 new from the founder")).toBeVisible();
  await user.getByRole("link", { name: /KindChat team/ }).first().click();
  await expect(user).toHaveURL(/\/team/);
  await expect(user.getByText(/founder of KindChat/i).first()).toBeVisible();
  await expect(user.getByText("Founder", { exact: true })).toBeVisible();

  // The user replies; the founder sees it in the inbox.
  const box = user.getByRole("textbox", { name: "Message Pansin" }).or(user.locator("#composer")).first();
  await box.fill("Thanks! Love the app 💜");
  await box.press("Enter");

  const founder = await (await browser.newContext()).newPage();
  await founder.goto("/login");
  await founder.getByLabel("Username").fill(FOUNDER!);
  await founder.getByLabel("Password", { exact: true }).fill(FOUNDER_PASSWORD!);
  await founder.getByRole("button", { name: "Sign in" }).click();
  await expect(founder).toHaveURL(/\/dashboard/);
  await founder.goto("/inbox");
  await founder.getByLabel("Filter conversations").fill(`fan_${suffix}`);
  await founder.getByRole("link", { name: /Fan/ }).click();
  await expect(founder.getByText("Thanks! Love the app 💜")).toBeVisible();

  // The founder answers in real time.
  const reply = founder.locator("#composer");
  await reply.fill("So happy to hear that!");
  await reply.press("Enter");
  await expect(user.getByText("So happy to hear that!")).toBeVisible();

  // The founder can start a chat with any user by username.
  const other = await register(browser, `quiet_${suffix}`, "Quiet");
  await founder.goto("/inbox");
  await founder.getByLabel("Start a chat by username").fill(`@quiet_${suffix}`);
  await founder.getByRole("button", { name: "Start chat" }).click();
  await expect(founder).toHaveURL(/\/inbox\?c=/);
  await founder.locator("#composer").fill("Hi Quiet, welcome aboard.");
  await founder.locator("#composer").press("Enter");
  await other.goto("/team");
  await expect(other.getByText("Hi Quiet, welcome aboard.")).toBeVisible();

  // Regular users have no inbox and cannot reach other users this way.
  await other.goto("/inbox");
  await expect(other.getByText("This page is only for the KindChat founder.")).toBeVisible();
});

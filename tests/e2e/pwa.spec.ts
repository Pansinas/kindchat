import { expect, test } from "@playwright/test";

test("the app is installable: manifest, icons and service worker @mobile", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "KindChat", display: "standalone", start_url: "/dashboard" });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);

  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const registered = await page.evaluate(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    return Boolean(reg && (reg as ServiceWorkerRegistration).active);
  });
  expect(registered).toBe(true);
});

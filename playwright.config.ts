import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app (`npm run build && npm start`) connected to a
 * Supabase stack (local `supabase start` or a disposable project). Set E2E_BASE_URL to override.
 * Set PW_CHROMIUM_PATH to use a preinstalled Chromium binary.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});

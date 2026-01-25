import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, ".env.local") });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests sequentially for data isolation */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results.json" }],
    ["github"], // Nice annotations in PR
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    // Keep date computations deterministic across machines/CI.
    timezoneId: "UTC",
    extraHTTPHeaders: {
      "x-vercel-protection-bypass":
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 }, // Larger viewport for better screenshots/videos
      },
    },
    // Optionally add firefox, webkit for cross-browser
  ],

  // Start dev server if not running (optional for local dev)
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

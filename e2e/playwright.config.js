import { defineConfig, devices } from "@playwright/test";
// The stand-in Paystack is started by global-setup.mjs on this fixed address.
const PAYSTACK_URL = "http://127.0.0.1:4510";
const PAYSTACK_SECRET = "sk_test_standin";

// In CI the normal Playwright Chromium is installed. In an environment that cannot download one,
// set PW_CHROMIUM_PATH (and optionally PW_CHROMIUM_ARGS as JSON) to a Chromium you already have.
const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH, args: process.env.PW_CHROMIUM_ARGS ? JSON.parse(process.env.PW_CHROMIUM_ARGS) : [] }
  : {};

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.mjs",
  timeout: 90000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:4600", screenshot: "only-on-failure", trace: "retain-on-failure", launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    // the most phone-heavy journeys also run on a phone-sized screen
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions }, grep: /@phone/ },
  ],
  webServer: {
    command: "node src/db/migrate.js && node src/db/seed-prices.js && node src/db/seed-admin.js --email admin@ephaag.test --password Admin1234 --name Admin && node src/server.js",
    cwd: "../backend",
    url: "http://localhost:4600/health",
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      PORT: "4600", NODE_ENV: "development", JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret",
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/ephaag_e2e", DB_SSL: "false",
      RATE_LIMIT_MULTIPLIER: "1000", SAVINGS_DEPOSIT_WINDOW_OVERRIDE: "true", EMAIL_DRIVER: "log", JOB_RUNNER: "off",
      PAYSTACK_SECRET_KEY: PAYSTACK_SECRET, PAYSTACK_BASE_URL: PAYSTACK_URL, FARMER_GATE_DEFAULT: "off", DOJAH_BASE_URL: PAYSTACK_URL, DOJAH_APP_ID: "test-app", DOJAH_SECRET_KEY: "test-secret", FRONTEND_ORIGIN: "http://localhost:4600",
    },
  },
});

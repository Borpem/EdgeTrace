import { defineConfig, devices } from "@playwright/test";

const useManagedServer = process.env.PW_MANAGED_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: "edgeTraceHappyPath.spec.ts",
  outputDir: "test-results/e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:7174",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: useManagedServer
    ? undefined
    : {
        command: "node scripts/dev-e2e.mjs",
        url: "http://127.0.0.1:7174",
        reuseExistingServer: true,
        timeout: 120_000
      }
});

import { defineConfig } from "@playwright/test";

const port = 4178;
const useManagedServer = process.env.PW_SEO_MANAGED_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: "seo.spec.ts",
  outputDir: "test-results/seo",
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: {
    timeout: 7_500
  },
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: useManagedServer
    ? undefined
    : {
        command: `node scripts/serveSeo.mjs --port ${port}`,
        url: `http://127.0.0.1:${port}/__seo-health`,
        reuseExistingServer: false,
        timeout: 30_000
      }
});

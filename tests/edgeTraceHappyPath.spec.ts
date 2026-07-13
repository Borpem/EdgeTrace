import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:4107";
const e2eReportPrefix = "E2E Sample CSV Report";
const e2eReportName = `${e2eReportPrefix} Primary`;

test.describe.serial("EdgeTrace happy path", () => {
  test.beforeAll(async ({ request }) => {
    await cleanupDemoData(request);
    await cleanupE2eReports(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupDemoData(request);
    await cleanupE2eReports(request);
  });

  test("Home CTA flow", async ({ page }) => {
    await page.goto("/");
    const publicHeader = page.locator("header.EdgeTrace-topbar");

    await expect(page.getByRole("heading", { name: /Stop guessing why your trades are losing money/i })).toBeVisible();
    await expect(publicHeader.getByRole("link", { name: "How It Works" })).toBeVisible();
    await expect(publicHeader.getByRole("link", { name: "Broker CSV" })).toHaveCount(0);
    await expect(publicHeader.getByRole("link", { name: "Pricing" })).toBeVisible();
    await expect(publicHeader.getByRole("link", { name: "Sample Report" })).toHaveCount(0);
    await expect(publicHeader.getByRole("link", { name: "Login" })).toBeVisible();
    await expect(publicHeader.getByRole("link", { name: "Sign Up" })).toBeVisible();
    await page.getByRole("link", { name: "Create Free Account", exact: true }).click();

    await expect(page.getByText("Create a strategy diagnostics workspace.")).toBeVisible();
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByRole("heading", { name: "Create a Diagnostic Report" })).toBeVisible();
  });

  test("Public legal routes are reachable", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer.EdgeTrace-public-footer");
    await footer.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await footer.getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

    await footer.getByRole("link", { name: "Disclaimer" }).click();
    await expect(page).toHaveURL(/\/disclaimer/);
    await expect(page.getByRole("heading", { name: "Financial and Trading Disclaimer" })).toBeVisible();
  });

  test("Clerk nested auth routes stay on auth pages", async ({ page }) => {
    await page.goto("/signup/verify-email-address");
    await expect(page.getByRole("heading", { name: "Create a strategy diagnostics workspace." })).toBeVisible();
    await expect(page).not.toHaveURL(/\/$/);

    await page.goto("/login/factor-one");
    await expect(page.getByRole("heading", { name: "Welcome back to EdgeTrace." })).toBeVisible();
    await expect(page).not.toHaveURL(/\/$/);
  });

  test("Public pricing keeps the shared site header", async ({ page }) => {
    await page.goto("/");
    const topbar = page.locator("header.EdgeTrace-topbar");
    await topbar.getByRole("link", { name: "Pricing" }).click();

    await expect(page).toHaveURL(/\/pricing/);
    await expect(topbar).toBeVisible();
    await expect(page.getByRole("heading", { name: "Simple pricing. Serious edge." })).toBeVisible();
    await expect(page.locator(".EdgeTrace-pricing-nav")).toHaveCount(0);
    await expect(topbar.getByRole("link", { name: "How It Works" })).toBeVisible();
    await expect(topbar.getByRole("link", { name: "Broker CSV" })).toHaveCount(0);
    await expect(topbar.getByRole("link", { name: "Pricing" })).toHaveClass(/EdgeTrace-nav-link-active/);
    await expect(topbar.getByRole("link", { name: "Login" })).toBeVisible();
    await expect(topbar.getByRole("link", { name: "Sign Up" })).toBeVisible();
    await expect(topbar.getByRole("link", { name: "Resources" })).toHaveCount(0);
    await expect(topbar.getByRole("link", { name: "About" })).toHaveCount(0);
  });

  test("Upload sample CSV flow", async ({ page }) => {
    const analyticsRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname === "/api/events" ||
        url.pathname.startsWith("/_vercel/insights") ||
        url.hostname === "va.vercel-scripts.com" ||
        url.hostname === "vitals.vercel-insights.com"
      ) {
        analyticsRequests.push(request.url());
      }
    });

    await page.goto("/app/upload");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByRole("button", { name: "Continue to App" }).click();
    await dismissFeatureIntro(page);

    await page.getByTestId("upload-input").setInputFiles("public/sample-trades.csv");
    await expect(page.getByText("Detected Source", { exact: true })).toBeVisible();
    await expect(page.getByText(/normalized trades|reconstructed trades/i)).toBeVisible();

    await page.getByPlaceholder("Optional report name").fill(e2eReportName);
    await page.getByTestId("sticky-run-diagnostics-button").click();

    const healthCard = page.getByTestId("dashboard-health-card");
    await expect(healthCard).toBeVisible();
    await expect(page.locator(".EdgeTrace-sidebar-user")).toHaveCount(0);
    const commandAccountMenu = page.locator(".EdgeTrace-command-nav .EdgeTrace-account-utility-menu-button");
    await expect(commandAccountMenu).toBeVisible();
    await commandAccountMenu.click();
    await expect(page.getByRole("menuitem", { name: /Account/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Log out/i })).toBeVisible();
    await expect(page.locator(".EdgeTrace-command-nav").getByRole("button", { name: "Dashboard", exact: true })).toHaveClass(/active/);
    await expect(page.getByText("Report Overview", { exact: true })).toBeVisible();
    await expect(page.getByText("Edge Health", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Net PnL", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Profit Factor", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Recommended Actions (Next Steps)", { exact: true })).toBeVisible();
    await expect(page.getByText("Supporting Context", { exact: true })).toBeVisible();
    await expect(page.getByText("EdgeTrace Benchmarks", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Benchmark scorecards")).toHaveCount(0);
    expect(analyticsRequests).toEqual([]);
    expect(await page.evaluate(() => window.localStorage.getItem("edgetrace.analyticsId"))).toBeNull();
  });

  test("Owner-disabled launch features remain unavailable", async ({ request }) => {
    const benchmarkResponse = await request.get(`${apiBaseUrl}/api/diagnostics/release-disabled/benchmarks`);
    expect(benchmarkResponse.status()).toBe(404);
    expect(await benchmarkResponse.json()).toEqual({ error: "NOT_FOUND" });

    const analyticsResponse = await request.post(`${apiBaseUrl}/api/events`, {
      data: { eventName: "landing_page_viewed", anonymousId: "release-disabled" }
    });
    expect(analyticsResponse.status()).toBe(404);
    expect(await analyticsResponse.json()).toEqual({ error: "NOT_FOUND" });
  });

  test("Reports and Compare flow", async ({ page, request }) => {
    const reports = await ensureAtLeastTwoReports(page, request);

    await login(page, "/app/reports");
    await expect(page.getByTestId("reports-list")).toBeVisible();
    await expect(page.getByText("The EdgeTrace service hit an internal error")).toHaveCount(0);

    await page.getByRole("navigation").getByRole("button", { name: "Compare" }).click();
    await expect(page.getByTestId("compare-page")).toBeVisible();
    await dismissFeatureIntro(page);
    await page.getByTestId("report-a-select").selectOption(reports[0].id);
    await page.getByTestId("report-b-select").selectOption(reports[1].id);

    await expect(page.getByText("Metric Comparison")).toBeVisible();
    await expect(page.getByText("Interpretation", { exact: true })).toBeVisible();
    await expect(page.getByText("Breakdown Comparison")).toBeVisible();

    await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();
    await expect(page.getByTestId("reports-list")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByTestId("reports-list")
      .locator("article")
      .filter({ hasText: reports[0].name })
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect(page.getByText("The EdgeTrace service hit an internal error")).toHaveCount(0);
    await expect(page.getByTestId("reports-list").locator("article").filter({ hasText: reports[0].name })).toHaveCount(0);

    const remainingReports = await listReports(request);
    expect(remainingReports.some((report) => report.id === reports[0].id)).toBeFalsy();
  });

  test("Authenticated app shell keeps page content directly below the top bar", async ({ page }) => {
    const routes = ["/app/upload", "/app/reports", "/app/collections", "/app/compare", "/app/how-it-works"];

    for (const route of routes) {
      await login(page, route);

      const topbar = page.locator(".EdgeTrace-auth-topbar");
      const content = page.locator(".EdgeTrace-auth-framed > main.EdgeTrace-shell").first();
      await expect(topbar).toBeVisible();
      await expect(content).toBeVisible();
      await expect(page.locator(".EdgeTrace-sidebar-user")).toHaveCount(0);
      const accountMenuButton = topbar.locator(".EdgeTrace-account-utility-menu-button");
      await expect(accountMenuButton).toBeVisible();
      await accountMenuButton.click();
      await expect(page.getByRole("menuitem", { name: /Account/i })).toBeVisible();
      await page.getByRole("menuitem", { name: /Account/i }).click();
      await expect(page).toHaveURL(/\/app\/account/);
      await login(page, route);
      await accountMenuButton.click();
      await expect(page.getByRole("menuitem", { name: /Log out/i })).toBeVisible();
      await page.getByRole("menuitem", { name: /Log out/i }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
      await login(page, route);
      await expect(topbar.getByRole("button", { name: "Guide" })).toHaveCount(0);
      if (route === "/app/collections") {
        await expect(page.getByText("Guided Command Path")).toHaveCount(0);
      }

      const topbarBox = await topbar.boundingBox();
      const contentBox = await content.boundingBox();
      expect(topbarBox).not.toBeNull();
      expect(contentBox).not.toBeNull();
      expect(contentBox!.y).toBeLessThanOrEqual(topbarBox!.y + topbarBox!.height + 24);
    }
  });
});

async function ensureAtLeastTwoReports(page: Page, request: APIRequestContext) {
  let reports = await listReports(request);
  while (reports.length < 2) {
    await createReportFromUpload(page, `${e2eReportPrefix} ${reports.length + 1}`);
    reports = await listReports(request);
  }
  return reports.slice(0, 2);
}

async function createReportFromUpload(page: Page, name: string) {
  await login(page, "/app/upload");
  await page.getByTestId("upload-input").setInputFiles("public/sample-trades.csv");
  await expect(page.getByText("Detected Source", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Optional report name").fill(name);
  await page.getByTestId("sticky-run-diagnostics-button").click();
  await expect(page.getByTestId("dashboard-health-card")).toBeVisible();
}

async function login(page: Page, nextPath = "/app/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  const destination = new RegExp(nextPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const continueButton = page.getByRole("button", { name: "Continue to App" });
  await expect
    .poll(async () => destination.test(new URL(page.url()).pathname) || (await continueButton.isVisible()))
    .toBeTruthy();
  if (!destination.test(new URL(page.url()).pathname)) {
    await continueButton.click();
  }
  await expect(page).toHaveURL(destination);
  await dismissFeatureIntro(page);
}

async function dismissFeatureIntro(page: Page) {
  const overlay = page.locator(".EdgeTrace-feature-intro-overlay");
  await overlay.waitFor({ state: "visible", timeout: 1000 }).catch(() => undefined);
  if (!(await overlay.isVisible())) return;
  await overlay.getByRole("button", { name: "Got it" }).click();
  await expect(overlay).toHaveCount(0);
}

async function listReports(request: APIRequestContext): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get(`${apiBaseUrl}/api/diagnostics`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { reports?: Array<{ id: string; name: string }> };
  return body.reports ?? [];
}

async function cleanupDemoData(request: APIRequestContext) {
  await request.delete(`${apiBaseUrl}/api/demo-data`);
}

async function cleanupE2eReports(request: APIRequestContext) {
  const reports = await listReports(request);
  await Promise.all(
    reports
      .filter((report) => report.name.startsWith(e2eReportPrefix))
      .map((report) => request.delete(`${apiBaseUrl}/api/diagnostics/${report.id}`))
  );
}

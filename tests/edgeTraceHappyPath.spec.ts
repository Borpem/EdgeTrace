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

    await expect(page.getByText(/Know exactly why your strategy wins or fails/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Product" })).toBeVisible();
    await expect(page.getByRole("button", { name: "How It Works" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pricing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
    await page.getByRole("button", { name: "Analyze My Trades", exact: true }).click();

    await expect(page.getByText("Create a strategy diagnostics workspace.")).toBeVisible();
    await page.getByRole("button", { name: "Create Demo Account" }).click();
    await expect(page.getByRole("heading", { name: "Create a Diagnostic Report" })).toBeVisible();
  });

  test("Upload sample CSV flow", async ({ page }) => {
    await page.goto("/app/upload");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByRole("button", { name: "Continue to App" }).click();

    await page.getByTestId("upload-input").setInputFiles("public/sample-trades.csv");
    await expect(page.getByText("Detected Source", { exact: true })).toBeVisible();
    await expect(page.getByText(/normalized trades|reconstructed trades/i)).toBeVisible();

    await page.getByPlaceholder("Optional report name").fill(e2eReportName);
    await page.getByTestId("sticky-run-diagnostics-button").click();

    const healthCard = page.getByTestId("dashboard-health-card");
    await expect(healthCard).toBeVisible();
    await expect(page.getByText("After-cost performance", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Execution friction", { exact: true }).first()).toBeVisible();
  });

  test("Reports and Compare flow", async ({ page, request }) => {
    const reports = await ensureAtLeastTwoReports(page, request);

    await login(page, "/app/reports");
    await expect(page.getByTestId("reports-list")).toBeVisible();

    await page.getByRole("navigation").getByRole("button", { name: "Compare" }).click();
    await expect(page.getByTestId("compare-page")).toBeVisible();
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

  test("Public interactive demo flow", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("launch-full-demo-button").click();

    await expect(page).toHaveURL(/\/demo/);
    await expect(page.getByText("Interactive Demo", { exact: true })).toBeVisible();
    await expect(page.getByText(/Sample data - no account required/i)).toBeVisible();
    await expect(page.getByText("Start with the primary diagnosis.")).toBeVisible();
    await expect(page.getByText("Strategy Health", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Primary Diagnosis", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Inspect the Leak" }).first().click();
    await expect(page.getByText("Inspect the segment causing the leak.")).toBeVisible();
    await page.getByRole("button", { name: /Opening Session/ }).first().click();
    await expect(page.getByText("Attribution detail")).toBeVisible();

    await page.getByRole("button", { name: "Compare Iterations" }).first().click();
    await expect(page.getByText("V1 Baseline vs V2 Lower Costs")).toBeVisible();
    await expect(page.getByText("V2 improved because cost drag fell and R capture increased.")).toBeVisible();

    await page.getByRole("button", { name: "View Strategy Trend" }).first().click();
    await expect(page.getByText("One strategy, three iterations.")).toBeVisible();

    await page.getByRole("button", { name: "Start With Your Trades" }).first().click();
    await expect(page.getByRole("heading", { name: "Ready to analyze your own trades?" }).last()).toBeVisible();
    await page.getByRole("button", { name: "Create Free Account" }).first().click();
    await expect(page).toHaveURL(/\/signup\?next=/);
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
  const continueButton = page.getByRole("button", { name: "Continue to App" });
  if (await continueButton.isVisible()) {
    await continueButton.click();
  } else {
    await expect(page).toHaveURL(new RegExp(nextPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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

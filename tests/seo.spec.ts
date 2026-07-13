import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  SITE_URL,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  indexedSeoRoutes,
  noindexSeoRoutes,
  notFoundSeoRoute,
  resolveSeoRoute,
  type SeoRoute
} from "../src/lib/seo";
import { AGGREGATE_BENCHMARKS_ENABLED, planConfigs } from "../src/lib/plans";
import { NON_ESSENTIAL_ANALYTICS_ENABLED } from "../src/lib/releasePolicy";

const ROOT_DIR = resolve(process.cwd());
const DIST_DIR = resolve(ROOT_DIR, "dist");
const indexedPaths = indexedSeoRoutes.map((route) => route.path);
const publicShellRoutes = [...indexedSeoRoutes, ...noindexSeoRoutes];
const legacyRedirects = new Map([
  ["/dashboard", "/app/dashboard"],
  ["/upload", "/app/upload"],
  ["/reports", "/app/reports"],
  ["/collections", "/app/collections"],
  ["/compare", "/app/compare"],
  ["/how-it-works", "/"],
  ["/demo", "/"],
  ["/sample-report", "/"]
]);
const legacyNestedRedirects = [
  { source: "/dashboard/:path*", destination: "/app/dashboard/:path*", example: ["/dashboard/report/123", "/app/dashboard/report/123"] },
  { source: "/collections/:path*", destination: "/app/collections/:path*", example: ["/collections/set/123", "/app/collections/set/123"] },
  { source: "/compare/:path*", destination: "/app/compare/:path*", example: ["/compare/run/123", "/app/compare/run/123"] }
];

test.describe("generated metadata and initial HTML", () => {
  for (const route of publicShellRoutes) {
    test(`${route.path} has route-specific raw metadata and meaningful content`, async ({ browser }) => {
      const { context, page } = await openWithoutJavaScript(browser, route.path);
      await expect(page).toHaveTitle(route.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", route.description);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", route.robots);

      if (route.canonical) {
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", route.canonical);
      } else {
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      }

      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", route.title);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", route.description);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https:\/\//);
      await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute("content", "image/png");
      await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", SOCIAL_IMAGE_WIDTH);
      await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", SOCIAL_IMAGE_HEIGHT);
      await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", /EdgeTrace/);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
      await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute("content", /EdgeTrace/);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);

      const initialText = normalizeText(await page.locator("#root").textContent());
      expect(initialText.length).toBeGreaterThan(120);
      expect(initialText).not.toMatch(/^loading edgeTrace/i);
      await expect(page.locator('nav[aria-label="Primary navigation"] a[href]')).toHaveCount(5);
      await context.close();
    });
  }

  test("titles, descriptions, and canonicals are unique where required", async ({ browser }) => {
    const titles: string[] = [];
    const descriptions: string[] = [];
    const canonicals: string[] = [];

    for (const route of publicShellRoutes) {
      const { context, page } = await openWithoutJavaScript(browser, route.path);
      titles.push(await page.title());
      descriptions.push((await page.locator('meta[name="description"]').getAttribute("content")) ?? "");
      const canonicalLocator = page.locator('link[rel="canonical"]');
      const canonical = (await canonicalLocator.count()) > 0 ? await canonicalLocator.getAttribute("href") : null;
      if (canonical) canonicals.push(canonical);
      await context.close();
    }

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  test("the private app shell is useful but explicitly non-indexable", async ({ browser }) => {
    const route = resolveSeoRoute("/app");
    const { context, page, response } = await openWithoutJavaScript(browser, "/app/dashboard/report/example");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(route.title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", route.robots);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator("h1")).toContainText("workspace");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await context.close();
  });

  test("aggregate benchmark features and public mentions remain out of this launch", async ({ browser }) => {
    expect(AGGREGATE_BENCHMARKS_ENABLED).toBe(false);
    expect(planConfigs.pro.features.aggregate_benchmarks).toBe(false);
    expect(planConfigs.advanced.features.aggregate_benchmarks).toBe(false);

    for (const path of indexedPaths) {
      const { context, page } = await openWithoutJavaScript(browser, path);
      expect(normalizeText(await page.locator("#root").textContent()), path).not.toMatch(
        /aggregate benchmark|benchmark percentile|cohort percentile|benchmark movement|benchmark context/i
      );
      await context.close();
    }
  });

  test("non-essential analytics remain disabled in the browser", async ({ browser }) => {
    expect(NON_ESSENTIAL_ANALYTICS_ENABLED).toBe(false);
    expect(readFileSync(resolve(ROOT_DIR, "src", "main.tsx"), "utf8")).not.toContain("@vercel/analytics");
    expect(readFileSync(resolve(ROOT_DIR, "vercel.json"), "utf8")).not.toMatch(
      /va\.vercel-scripts\.com|vitals\.vercel-insights\.com/
    );

    const productionJavaScript = readdirSync(resolve(DIST_DIR, "assets"))
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(resolve(DIST_DIR, "assets", name), "utf8"))
      .join("\n");
    expect(productionJavaScript).not.toMatch(/_vercel\/insights|va\.vercel-scripts\.com|vitals\.vercel-insights\.com/);

    const context = await browser.newContext();
    const page = await context.newPage();
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

    await page.goto("/");
    await page.getByRole("link", { name: "Create Free Account", exact: true }).click();
    for (const path of ["/pricing", "/broker-csv-trade-analysis", "/login", "/signup"]) {
      await page.goto(path);
    }
    await page.waitForTimeout(750);

    expect(analyticsRequests).toEqual([]);
    await expect(page.locator('script[src*="/_vercel/insights"], script[src*="va.vercel-scripts.com"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("edgetrace.analyticsId"))).toBeNull();
    await context.close();
  });

});

test.describe("structured data", () => {
  for (const route of indexedSeoRoutes.filter((candidate) => candidate.structuredData)) {
    test(`${route.path} has parseable and truthful JSON-LD`, async ({ browser }) => {
      const { context, page } = await openWithoutJavaScript(browser, route.path);
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(blocks).toHaveLength(1);

      const data = JSON.parse(blocks[0]) as Record<string, unknown>;
      expect(data["@context"]).toBe("https://schema.org");
      const types = collectValuesForKey(data, "@type");
      expect(types).toContain("WebApplication");
      if (route.path === "/broker-csv-trade-analysis") expect(types).toContain("BreadcrumbList");

      const forbiddenKeys = collectObjectKeys(data).filter((key) =>
        ["aggregaterating", "ratingvalue", "review", "reviewrating", "ratingcount", "reviewcount"].includes(
          key.toLowerCase()
        )
      );
      expect(forbiddenKeys).toEqual([]);

      for (const value of collectValuesForKey(data, "url")) {
        expect(() => new URL(String(value))).not.toThrow();
      }
      await context.close();
    });
  }

  for (const route of [
    ...noindexSeoRoutes,
    ...indexedSeoRoutes.filter((candidate) => !candidate.structuredData)
  ]) {
    test(`${route.path} does not publish structured data`, async ({ browser }) => {
      const { context, page } = await openWithoutJavaScript(browser, route.path);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
      await context.close();
    });
  }
});

test.describe("robots, sitemap, and platform routing", () => {
  test("robots.txt is plain text and only blocks private or utility paths", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).not.toContain("Disallow: /app");
    expect(body).not.toContain("Disallow: /login");
    expect(body).not.toContain("Disallow: /signup");
    expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(body).not.toMatch(/^\s*Noindex:/im);
    for (const path of indexedPaths) expect(isDisallowed(body, path)).toBe(false);
  });

  test("sitemap.xml contains exactly the canonical indexable routes", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');

    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => normalizeUrl(match[1]));
    const expected = indexedSeoRoutes.map((route) => normalizeUrl(route.canonical!));
    expect([...locations].sort()).toEqual([...expected].sort());
    expect(new Set(locations).size).toBe(locations.length);

    for (const location of locations) {
      const url = new URL(location);
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe("www.edgetrace.app");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      const local = await request.get(url.pathname);
      expect(local.status()).toBe(200);
    }
  });

  test("vercel.json has scoped SPA rewrites, exact redirects, and crawl-control headers", () => {
    const config = JSON.parse(readFileSync(resolve(ROOT_DIR, "vercel.json"), "utf8")) as {
      cleanUrls?: boolean;
      trailingSlash?: boolean;
      redirects?: Array<{ source: string; destination: string; statusCode?: number }>;
      rewrites?: Array<{ source: string; destination: string }>;
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    expect(config.cleanUrls).toBe(true);
    expect(config.trailingSlash).toBe(false);

    const redirects = new Map((config.redirects ?? []).map((item) => [item.source, item]));
    for (const [source, destination] of legacyRedirects) {
      expect(redirects.get(source)).toMatchObject({ destination, statusCode: 301 });
      expect(redirects.get(`${source}/`)).toMatchObject({ destination, statusCode: 301 });
    }
    for (const { source, destination } of legacyNestedRedirects) {
      expect(redirects.get(source)).toMatchObject({ destination, statusCode: 301 });
    }

    const rewrites = config.rewrites ?? [];
    expect(rewrites).toContainEqual({
      source: "/api/:path*",
      destination: "https://edgetrace-production.up.railway.app/api/:path*"
    });
    expect(rewrites).toContainEqual({ source: "/app", destination: "/shells/app" });
    expect(rewrites).toContainEqual({ source: "/app/:path*", destination: "/shells/app" });
    expect(rewrites).toContainEqual({ source: "/login", destination: "/shells/login" });
    expect(rewrites).toContainEqual({ source: "/login/:path*", destination: "/shells/login" });
    expect(rewrites).toContainEqual({ source: "/signup", destination: "/shells/signup" });
    expect(rewrites).toContainEqual({ source: "/signup/:path*", destination: "/shells/signup" });
    for (const rewrite of rewrites.filter((item) => /\/(?:app|login|signup)/.test(item.source))) {
      expect(rewrite.destination, `rewrite loop for ${rewrite.source}`).toMatch(/^\/shells\//);
      expect(rewrite.destination).not.toMatch(/\.html$/);
    }
    expect(rewrites.some((rewrite) => rewrite.source === "/(.*)" || rewrite.source === "/:path*")).toBe(false);

    const noindexHeaderSources = (config.headers ?? [])
      .filter((entry) => entry.headers.some((header) => header.key.toLowerCase() === "x-robots-tag"))
      .map((entry) => entry.source);
    for (const source of [
      "/app/:path*",
      "/login/:path*",
      "/signup/:path*",
      "/sample-:path*",
      "/api/:path*",
      "/brand/atlas-brand-sheet",
      "/brand/edgetrace-brand-sheet",
      "/shells/:path*"
    ]) {
      expect(noindexHeaderSources).toContain(source);
    }

    const assets = (config.headers ?? []).find((entry) => entry.source === "/assets/:path*");
    expect(assets?.headers).toContainEqual({
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable"
    });
    for (const source of ["/brand/:path*", "/graphics/:path*", "/marketing/:path*"]) {
      const cache = (config.headers ?? []).find((entry) => entry.source === source);
      expect(cache?.headers).toContainEqual({
        key: "Cache-Control",
        value: "public, max-age=86400, stale-while-revalidate=604800"
      });
    }
  });

});

test.describe("status codes, redirects, and response directives", () => {
  for (const [source, destination] of legacyRedirects) {
    test(`${source} returns a 301 redirect`, async ({ request }) => {
      const response = await request.get(`${source}?from=seo-test`, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(`${destination}?from=seo-test`);
    });
  }

  test("trailing-slash legacy aliases redirect to their final destinations in one hop", async ({ request }) => {
    for (const [source, destination] of legacyRedirects) {
      const response = await request.get(`${source}/?from=seo-test`, { maxRedirects: 0 });
      expect(response.status(), source).toBe(301);
      expect(response.headers().location, source).toBe(`${destination}?from=seo-test`);
    }
  });

  for (const { source, destination, example } of legacyNestedRedirects) {
    test(`${source} returns a path-preserving 301 redirect`, async ({ request }) => {
      const response = await request.get(`${example[0]}?from=seo-test`, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(`${example[1]}?from=seo-test`);
      expect(destination).toContain(":path*");
    });
  }

  test("unknown and case-variant URLs return the static no-JavaScript 404", async ({ request }) => {
    for (const path of ["/this-page-does-not-exist", "/Pricing", "/404"]) {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      const html = await response.text();
      expect(html).toContain("Page not found");
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/rel=["']canonical["']/i);
    }
  });

  test("clean URL behavior removes trailing slashes and HTML extensions", async ({ request }) => {
    const trailing = await request.get("/pricing/", { maxRedirects: 0 });
    expect(trailing.status()).toBe(308);
    expect(trailing.headers().location).toBe("/pricing");
    const extension = await request.get("/pricing.html", { maxRedirects: 0 });
    expect(extension.status()).toBe(308);
    expect(extension.headers().location).toBe("/pricing");
  });

  test("unsupported methods return a complete empty 405 response", async ({ request }) => {
    const response = await request.post("/pricing");
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe("GET, HEAD");
    expect(response.headers()["content-length"]).toBe("0");
    expect((await response.body()).byteLength).toBe(0);
  });

  test("private, auth, API, brand, and sample responses carry noindex headers", async ({ request }) => {
    const expectations: Array<[string, number]> = [
      ["/app/dashboard", 200],
      ["/login/sso-callback", 200],
      ["/signup/continue", 200],
      ["/api/health", 502],
      ["/brand/edgetrace-brand-sheet", 200],
      ["/shells/app", 200],
      ["/sample-trades.csv", 200]
    ];
    for (const [path, status] of expectations) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(status);
      expect(response.headers()["x-robots-tag"], path).toContain("noindex");
      if (path.startsWith("/shells/")) {
        expect(await response.text()).toMatch(/<meta\s+name="robots"\s+content="noindex,/i);
      }
    }
  });

  test("approved legal notices are indexable without response-level noindex headers", async ({ request }) => {
    for (const path of ["/privacy", "/terms", "/disclaimer"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["x-robots-tag"], path).toBeUndefined();
    }
  });

  test("hashed production assets have immutable caching", async ({ request }) => {
    const asset = readdirSync(resolve(DIST_DIR, "assets")).find((name) => /-[A-Za-z0-9_-]+\.(?:js|css)$/.test(name));
    expect(asset).toBeTruthy();
    const response = await request.get(`/assets/${asset}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("public imagery is cached for one day without blocking image indexing", async ({ request }) => {
    for (const path of [
      "/brand/edgetrace-marketing-hero-v2.png",
      "/graphics/edgetrace-how-report-builder-workflow-clean.svg",
      "/marketing/edgetrace-segment-analysis-readout-polished.png"
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["cache-control"], path).toBe(
        "public, max-age=86400, stale-while-revalidate=604800"
      );
      expect(response.headers()["x-robots-tag"], path).toBeUndefined();
    }
  });

  test("retired aggregate benchmark marketing assets are not published", async ({ request }) => {
    for (const path of [
      "/graphics/edgetrace-how-pro-review-loop-thin-gauge.png",
      "/marketing/edgetrace-pro-review-loop-thin-gauge.png",
      "/marketing/edgetrace-review-loop.svg"
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect(response.headers()["x-robots-tag"], path).toContain("noindex");
    }
  });

});

test.describe("crawlability, links, accessibility, and layout", () => {
  test("indexed pages retain their primary content during JavaScript activation", async ({ browser }) => {
    for (const path of indexedPaths) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route(/\/assets\/(?:BrokerCsvPage|PricingPage)-.*\.js$/i, async (route) => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_800));
        await route.continue();
      });
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(200);
      expect(await page.locator("h1").count(), path).toBe(1);
      expect(await page.locator("#root").innerText(), path).not.toMatch(/Loading page/i);
      await context.close();
    }
  });

  test("pricing comparison headers are owned by ARIA rows", async ({ browser }) => {
    const { context, page } = await openWithoutJavaScript(browser, "/pricing");
    const headers = page.locator('[role="table"] [role="columnheader"]');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);
    expect(await page.locator('[role="table"] > [role="columnheader"]').count()).toBe(0);
    for (let index = 0; index < headerCount; index += 1) {
      expect(await headers.nth(index).evaluate((node) => node.parentElement?.getAttribute("role"))).toBe("row");
    }
    await context.close();
  });

  test("all public HTML links, images, scripts, and styles resolve", async ({ browser }) => {
    const checked = new Map<string, number>();
    for (const route of [...publicShellRoutes, notFoundSeoRoute]) {
      const path = route.path;
      const { context, page } = await openWithoutJavaScript(browser, path);
      const references = await page.locator("a[href], img[src], script[src], link[href]").evaluateAll((elements) =>
        elements.map((element) => ({
          tag: element.tagName.toLowerCase(),
          value: element.getAttribute(element.hasAttribute("href") ? "href" : "src") ?? ""
        }))
      );

      for (const reference of references) {
        if (!reference.value || reference.value.startsWith("data:") || reference.value.startsWith("mailto:")) continue;
        if (reference.value.startsWith("#")) {
          expect(await page.locator(reference.value).count(), `${path} -> ${reference.value}`).toBeGreaterThan(0);
          continue;
        }
        const target = new URL(reference.value, page.url());
        if (target.origin !== new URL(page.url()).origin) continue;
        const key = `${target.pathname}${target.search}`;
        if (checked.has(key)) continue;
        const response = await context.request.get(target.href);
        checked.set(key, response.status());
        expect(response.status(), `${path} -> ${key}`).toBeLessThan(400);
      }
      await context.close();
    }
    expect(checked.size).toBeGreaterThan(15);
  });

  for (const route of indexedSeoRoutes) {
    test(`${route.path} remains usable with JavaScript disabled`, async ({ browser }) => {
      const { context, page, response } = await openWithoutJavaScript(browser, route.path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      await expect(page.locator('a[aria-current="page"]')).not.toHaveCount(0);
      expect(normalizeText(await page.locator("main").textContent()).length).toBeGreaterThan(250);
      await context.close();
    });
  }

  test("representative pages have named controls, useful landmarks, and image alternatives", async ({ browser }) => {
    for (const route of indexedSeoRoutes) {
      const { context, page } = await openWithoutJavaScript(browser, route.path);
      const unnamed = await page.locator("a, button").evaluateAll((elements) =>
        elements
          .filter((element) => {
            const text = element.textContent?.trim() ?? "";
            const ariaLabel = element.getAttribute("aria-label")?.trim() ?? "";
            const title = element.getAttribute("title")?.trim() ?? "";
            const imageAlt = element.querySelector("img")?.getAttribute("alt")?.trim() ?? "";
            return !text && !ariaLabel && !title && !imageAlt;
          })
          .map((element) => element.outerHTML.slice(0, 160))
      );
      expect(unnamed, route.path).toEqual([]);
      expect(await page.locator("img:not([alt])").count(), route.path).toBe(0);
      expect(await page.locator("header").count(), route.path).toBeGreaterThan(0);
      expect(await page.locator("footer").count(), route.path).toBeGreaterThan(0);
      await context.close();
    }
  });

  test("content images reserve layout space", async ({ browser }) => {
    for (const route of indexedSeoRoutes) {
      const { context, page } = await openWithoutJavaScript(browser, route.path);
      const missingDimensions = await page.locator("main img").evaluateAll((images) =>
        images
          .filter((image) => !image.hasAttribute("width") || !image.hasAttribute("height"))
          .map((image) => image.getAttribute("src"))
      );
      expect(missingDimensions, route.path).toEqual([]);
      await context.close();
    }
  });

  for (const viewport of [
    { name: "mobile", width: 320, height: 740 },
    { name: "desktop", width: 1440, height: 900 }
  ]) {
    test(`indexed pages have no page-level ${viewport.name} overflow`, async ({ browser }) => {
      for (const route of indexedSeoRoutes) {
        const { context, page } = await openWithoutJavaScript(browser, route.path, viewport);
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        }));
        expect(dimensions.scrollWidth, route.path).toBeLessThanOrEqual(dimensions.clientWidth + 1);
        await context.close();
      }
    });
  }
});

test.describe("production performance budgets", () => {
  test("JavaScript-enabled homepage records stable representative web vitals", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4178",
      javaScriptEnabled: true,
      viewport: { width: 1365, height: 900 }
    });
    await context.addInitScript(() => {
      const target = window as Window & { __edgeTraceSeoVitals?: { cls: number; lcp: number } };
      target.__edgeTraceSeoVitals = { cls: 0, lcp: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
            if (!shift.hadRecentInput) target.__edgeTraceSeoVitals!.cls += shift.value ?? 0;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        // The assertion below reports unsupported or missing observations.
      }
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const latest = entries.at(-1);
          if (latest) target.__edgeTraceSeoVitals!.lcp = latest.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        // The assertion below reports unsupported or missing observations.
      }
    });

    const page = await context.newPage();
    const response = await page.goto("/", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
      );
    });
    await page.waitForFunction(
      () =>
        ((window as Window & { __edgeTraceSeoVitals?: { lcp: number } }).__edgeTraceSeoVitals?.lcp ?? 0) > 0,
      undefined,
      { timeout: 5_000 }
    );
    const metrics = await page.evaluate(() => {
      const target = window as Window & { __edgeTraceSeoVitals?: { cls: number; lcp: number } };
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        cls: target.__edgeTraceSeoVitals?.cls ?? Number.NaN,
        lcp: target.__edgeTraceSeoVitals?.lcp ?? Number.NaN,
        load: navigation ? navigation.loadEventEnd - navigation.startTime : Number.NaN
      };
    });
    expect(Number.isFinite(metrics.load)).toBe(true);
    expect(metrics.load, "local load event timing (ms)").toBeGreaterThan(0);
    expect(metrics.load, "local load event timing (ms)").toBeLessThanOrEqual(10_000);
    expect(Number.isFinite(metrics.lcp)).toBe(true);
    expect(metrics.lcp, "representative LCP (ms)").toBeGreaterThan(0);
    expect(metrics.lcp, "representative LCP (ms)").toBeLessThanOrEqual(2_500);
    expect(Number.isFinite(metrics.cls)).toBe(true);
    expect(metrics.cls, "representative CLS").toBeLessThanOrEqual(0.1);
    await expect(page.locator("h1")).toContainText("Trade performance analytics");
    await context.close();
  });

  test("critical JavaScript and CSS stay within regression budgets", () => {
    const files = readdirSync(resolve(DIST_DIR, "assets"));
    const javascript = files.filter((name) => name.endsWith(".js"));
    const styles = files.filter((name) => name.endsWith(".css"));
    expect(javascript.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);

    const jsRaw = sumFileBytes("assets", javascript);
    const cssRaw = sumFileBytes("assets", styles);
    const jsGzip = sumGzipBytes("assets", javascript);
    const cssGzip = sumGzipBytes("assets", styles);
    expect(jsRaw, "raw JavaScript bytes").toBeLessThanOrEqual(1_400_000);
    expect(cssRaw, "raw CSS bytes").toBeLessThanOrEqual(275_000);
    expect(jsGzip, "gzip JavaScript bytes").toBeLessThanOrEqual(390_000);
    expect(cssGzip, "gzip CSS bytes").toBeLessThanOrEqual(60_000);
  });

  test("prerendered HTML and referenced marketing images stay within explicit budgets", () => {
    for (const route of indexedSeoRoutes) {
      const htmlFile = route.path === "/" ? "index.html" : `${route.path.slice(1)}.html`;
      const html = readFileSync(resolve(DIST_DIR, htmlFile), "utf8");
      expect(Buffer.byteLength(html), `${route.path} HTML bytes`).toBeLessThanOrEqual(150_000);

      const sources = [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)]
        .map((match) => match[1])
        .filter((source) => source.startsWith("/"));
      const imageBytes = sources.map((source) => {
        const pathname = new URL(source, SITE_URL).pathname;
        const file = resolve(DIST_DIR, pathname.slice(1));
        return statSync(file).size;
      });
      for (const bytes of imageBytes) expect(bytes, `${route.path} individual image bytes`).toBeLessThanOrEqual(1_500_000);
      expect(imageBytes.reduce((sum, value) => sum + value, 0), `${route.path} referenced image bytes`).toBeLessThanOrEqual(
        8_000_000
      );
    }
  });
});

async function openWithoutJavaScript(
  browser: Browser,
  path: string,
  viewport = { width: 1280, height: 800 }
): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page; response: Awaited<ReturnType<Page["goto"]>> }> {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4178",
    javaScriptEnabled: false,
    viewport
  });
  const page = await context.newPage();
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  return { context, page, response };
}

function collectObjectKeys(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    output.push(key);
    collectObjectKeys(item, output);
  }
  return output;
}

function collectValuesForKey(value: unknown, target: string, output: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collectValuesForKey(item, target, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    if (key === target) output.push(item);
    collectValuesForKey(item, target, output);
  }
  return output;
}

function isDisallowed(robots: string, path: string) {
  const rules = robots
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^Disallow:/i.test(line))
    .map((line) => line.slice(line.indexOf(":") + 1).trim())
    .filter(Boolean);
  return rules.some((rule) => path.startsWith(rule));
}

function normalizeText(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  if (url.pathname === "/") url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

function sumFileBytes(directory: string, files: string[]) {
  return files.reduce((sum, file) => sum + statSync(join(DIST_DIR, directory, file)).size, 0);
}

function sumGzipBytes(directory: string, files: string[]) {
  return files.reduce(
    (sum, file) => sum + gzipSync(readFileSync(join(DIST_DIR, directory, file)), { level: 9 }).byteLength,
    0
  );
}

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureEducationPage } from "../src/pages/FeatureEducationPage";
import { BrokerCsvPage } from "../src/pages/BrokerCsvPage";
import { LegalPage, type LegalPageKind } from "../src/pages/LegalPage";
import { PricingPage } from "../src/pages/PricingPage";
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_WIDTH,
  indexedSeoRoutes,
  noindexSeoRoutes,
  notFoundSeoRoute,
  resolveSeoRoute,
  structuredDataForRoute,
  type SeoRoute
} from "../src/lib/seo";

const DIST_DIR = resolve(process.cwd(), "dist");
const TEMPLATE_PATH = resolve(DIST_DIR, "index.html");
const noop = () => undefined;

type OutputRoute = {
  path: string;
  file: string;
  seo: SeoRoute;
  content: ReactElement;
  includeScripts?: boolean;
};

const legalRoutes: Array<{ path: LegalPageKind; file: string }> = [
  { path: "privacy", file: "privacy.html" },
  { path: "terms", file: "terms.html" },
  { path: "disclaimer", file: "disclaimer.html" }
];

const outputRoutes: OutputRoute[] = [
  {
    path: "/",
    file: "index.html",
    seo: resolveSeoRoute("/"),
    content: (
      <FeatureEducationPage
        profile={null}
        isAuthenticated={false}
        onAnalyze={noop}
        onPricing={noop}
        onSignup={noop}
      />
    )
  },
  {
    path: "/broker-csv-trade-analysis",
    file: "broker-csv-trade-analysis.html",
    seo: resolveSeoRoute("/broker-csv-trade-analysis"),
    content: <BrokerCsvPage onHome={noop} onStart={noop} />
  },
  {
    path: "/pricing",
    file: "pricing.html",
    seo: resolveSeoRoute("/pricing"),
    content: <PricingPage profile={null} isAuthenticated={false} onStart={noop} />
  },
  ...legalRoutes.map<OutputRoute>(({ path, file }) => ({
    path: `/${path}`,
    file,
    seo: resolveSeoRoute(`/${path}`),
    content: <LegalPage kind={path} onContact={noop} />
  })),
  {
    path: "/login",
    file: "shells/login.html",
    seo: resolveSeoRoute("/login"),
    content: <AuthShell kind="login" />
  },
  {
    path: "/signup",
    file: "shells/signup.html",
    seo: resolveSeoRoute("/signup"),
    content: <AuthShell kind="signup" />
  },
  {
    path: "/app",
    file: "shells/app.html",
    seo: resolveSeoRoute("/app"),
    content: <PrivateAppShell />
  },
  {
    path: "/404",
    file: "404.html",
    seo: notFoundSeoRoute,
    content: <NotFoundPage />,
    includeScripts: false
  }
];

async function main() {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const buildTags = extractBuildTags(template);

  validateRouteManifest();

  for (const route of outputRoutes) {
    const page = renderDocument(template, buildTags, route);
    const outputPath = resolve(DIST_DIR, route.file);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, page, "utf8");
  }

  await writeFile(resolve(DIST_DIR, "sitemap.xml"), renderSitemap(), "utf8");
  await copyFile(resolve(process.cwd(), "public", "robots.txt"), resolve(DIST_DIR, "robots.txt"));
  process.stdout.write(`Prerendered ${outputRoutes.length} EdgeTrace route shells.\n`);
}

function renderDocument(template: string, buildTags: string[], route: OutputRoute) {
  const includeScripts = route.includeScripts !== false;
  let rootMarkup = renderToStaticMarkup(
    route.path === "/404" ? route.content : <PublicDocumentShell currentPath={route.path}>{route.content}</PublicDocumentShell>
  );
  if (route.path !== "/404") rootMarkup = ensureMainTarget(rootMarkup);
  const head = renderHead(route.seo, buildTags, includeScripts);
  const root = `<div id="root" data-prerendered-route="${escapeAttribute(route.path)}">${rootMarkup}</div>`;

  let page = template
    .replace(/<head>[\s\S]*?<\/head>/i, `<head>\n${head}\n  </head>`)
    .replace(/<body\b[^>]*>[\s\S]*?<\/body>/i, `<body>\n    ${root}\n  </body>`);

  if (!includeScripts) {
    page = page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  }

  return page;
}

function renderHead(route: SeoRoute, buildTags: string[], includeScripts: boolean) {
  const canonical = route.canonical ? `    <link rel="canonical" href="${escapeAttribute(route.canonical)}" />` : "";
  const pageUrl = route.canonical ?? `${SITE_URL}${route.path}`;
  const socialImage = `${SITE_URL}${SOCIAL_IMAGE_PATH}`;
  const structuredData = structuredDataForRoute(route);
  const jsonLd = structuredData
    ? `    <script id="edgetrace-structured-data" type="application/ld+json">${safeJson(structuredData)}</script>`
    : "";
  const retainedBuildTags = buildTags
    .filter((tag) => includeScripts || !tag.trimStart().startsWith("<script"))
    .map((tag) => `    ${tag}`)
    .join("\n");

  return [
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${escapeHtml(route.title)}</title>`,
    `    <meta name="description" content="${escapeAttribute(route.description)}" />`,
    `    <meta name="robots" content="${escapeAttribute(route.robots)}" />`,
    '    <meta name="theme-color" content="#05080f" />',
    canonical,
    '    <link rel="icon" type="image/svg+xml" href="/brand/edgetrace-favicon-e.svg?v=2" />',
    `    <meta property="og:site_name" content="${SITE_NAME}" />`,
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:title" content="${escapeAttribute(route.title)}" />`,
    `    <meta property="og:description" content="${escapeAttribute(route.description)}" />`,
    `    <meta property="og:url" content="${escapeAttribute(pageUrl)}" />`,
    `    <meta property="og:image" content="${escapeAttribute(socialImage)}" />`,
    '    <meta property="og:image:type" content="image/png" />',
    `    <meta property="og:image:width" content="${SOCIAL_IMAGE_WIDTH}" />`,
    `    <meta property="og:image:height" content="${SOCIAL_IMAGE_HEIGHT}" />`,
    `    <meta property="og:image:alt" content="${escapeAttribute(SOCIAL_IMAGE_ALT)}" />`,
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${escapeAttribute(route.title)}" />`,
    `    <meta name="twitter:description" content="${escapeAttribute(route.description)}" />`,
    `    <meta name="twitter:image" content="${escapeAttribute(socialImage)}" />`,
    `    <meta name="twitter:image:alt" content="${escapeAttribute(SOCIAL_IMAGE_ALT)}" />`,
    jsonLd,
    retainedBuildTags
  ]
    .filter(Boolean)
    .join("\n");
}

function extractBuildTags(template: string) {
  const head = template.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  return (head.match(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/gi) ?? []).filter((tag) =>
    /(?:src|href)=["']\/assets\//i.test(tag)
  );
}

function PublicDocumentShell({ currentPath, children }: { currentPath: string; children: ReactNode }) {
  return (
    <div className="EdgeTrace-contours min-h-screen text-ink EdgeTrace-public-framed">
      <a className="EdgeTrace-skip-link" href="#main-content">
        Skip to main content
      </a>
      <StaticHeader currentPath={currentPath} />
      {children}
      <StaticFooter currentPath={currentPath} />
    </div>
  );
}

const primaryNavigation = [
  { href: "/", label: "How It Works" },
  { href: "/broker-csv-trade-analysis", label: "Broker CSV" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Login" }
];

function StaticHeader({ currentPath }: { currentPath: string }) {
  return (
    <header className="EdgeTrace-topbar sticky top-0 z-40 EdgeTrace-public-topbar">
      <div className="EdgeTrace-shell EdgeTrace-public-topbar-inner relative flex h-auto flex-col items-center gap-4 py-4 lg:h-16 lg:flex-row lg:justify-end lg:py-0">
        <a className="EdgeTrace-public-logo-button flex shrink-0 items-center justify-center lg:justify-start" href="/" aria-label="EdgeTrace home">
          <span className="flex items-center justify-center gap-4">
            <img
              src="/brand/edgetrace-mark.svg"
              alt=""
              aria-hidden="true"
              className="h-7 w-auto object-contain opacity-85"
              width="28"
              height="28"
            />
            <img
              src="/brand/edgetrace_wordmark_monochrome_white.png"
              alt="EdgeTrace"
              className="h-[26px] w-auto object-contain opacity-85"
              width="188"
              height="26"
            />
          </span>
        </a>
        <nav className="EdgeTrace-public-nav flex flex-wrap items-center justify-center gap-6 text-sm lg:ml-auto lg:justify-end" aria-label="Primary navigation">
          {primaryNavigation.map(({ href, label }) => (
            <a
              className={`EdgeTrace-nav-link ${currentPath === href ? "EdgeTrace-nav-link-active" : ""}`}
              href={href}
              aria-current={currentPath === href ? "page" : undefined}
              key={href}
            >
              {label}
            </a>
          ))}
          <a
            className={`EdgeTrace-secondary-button px-4 py-2 ${currentPath === "/signup" ? "border-cyan/70" : ""}`}
            href="/signup?next=/app/upload"
            aria-current={currentPath === "/signup" ? "page" : undefined}
          >
            Sign Up
          </a>
        </nav>
      </div>
    </header>
  );
}

function StaticFooter({ currentPath }: { currentPath: string }) {
  const links = [
    { href: "/", label: "How It Works" },
    { href: "/broker-csv-trade-analysis", label: "Broker CSV" },
    { href: "/pricing", label: "Pricing" },
    { href: "/signup?next=/app/feedback", label: "Support", path: "/signup" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/disclaimer", label: "Disclaimer" }
  ];

  return (
    <footer className="EdgeTrace-public-footer">
      <div className="EdgeTrace-shell EdgeTrace-public-footer-inner">
        <div>
          <strong>{SITE_NAME}</strong>
          <p>Trade analytics for reviewing completed trade history. Educational and informational use only.</p>
        </div>
        <nav aria-label="Footer navigation">
          {links.map(({ href, label, path }) => (
            <a href={href} aria-current={currentPath === (path ?? href) ? "page" : undefined} key={href}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

function AuthShell({ kind }: { kind: "login" | "signup" }) {
  const isLogin = kind === "login";
  return (
    <main className="EdgeTrace-shell py-12 md:py-16">
      <section className="EdgeTrace-page-header grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Account access</p>
          <h1 className="mt-4 text-4xl font-semibold text-ink md:text-6xl">
            {isLogin ? "Welcome back to EdgeTrace." : "Create a strategy diagnostics workspace."}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            {isLogin
              ? "Log in to access your private reports, comparisons, strategy sets, and completed-trade diagnostic workflows."
              : "Create an account to import completed trades, build diagnostic reports, and review strategy changes over time."}
          </p>
        </div>
        <div className="EdgeTrace-card-soft p-6" aria-label={isLogin ? "Sign-in form loading" : "Account form loading"}>
          <h2 className="text-xl font-semibold text-ink">{isLogin ? "Sign in" : "Create account"}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            The account form loads here when JavaScript is available.
          </p>
          <a className="EdgeTrace-nav-link mt-5 inline-block" href={isLogin ? "/signup" : "/login"}>
            {isLogin ? "Need an account? Create one" : "Already have an account? Log in"}
          </a>
        </div>
      </section>
    </main>
  );
}

function PrivateAppShell() {
  return (
    <main className="EdgeTrace-shell py-12">
      <section className="EdgeTrace-command-card p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Private workspace</p>
        <h1 className="mt-4 text-3xl font-semibold text-ink">Your EdgeTrace workspace</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          EdgeTrace is checking your account before loading private completed-trade reports and diagnostics.
        </p>
        <a className="EdgeTrace-primary-button mt-6 inline-flex" href="/login">
          Log in to continue
        </a>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <div className="EdgeTrace-contours min-h-screen text-ink EdgeTrace-public-framed">
      <StaticHeader currentPath="/404" />
      <main id="main-content" className="EdgeTrace-shell py-16">
        <section className="EdgeTrace-command-card p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">404 error</p>
          <h1 className="mt-4 text-4xl font-semibold text-ink">Page not found</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            The requested page does not exist. Use one of the links below to continue browsing EdgeTrace.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a className="EdgeTrace-primary-button" href="/">Go to EdgeTrace home</a>
            <a className="EdgeTrace-secondary-button" href="/broker-csv-trade-analysis">Review broker CSV imports</a>
            <a className="EdgeTrace-secondary-button" href="/pricing">View pricing</a>
          </div>
        </section>
      </main>
      <StaticFooter currentPath="/404" />
    </div>
  );
}

function validateRouteManifest() {
  const outputPaths = new Set(outputRoutes.map((route) => route.path));
  for (const route of [...indexedSeoRoutes, ...noindexSeoRoutes]) {
    if (!outputPaths.has(route.path)) {
      throw new Error(`SEO route ${route.path} does not have a prerendered output.`);
    }
  }
  for (const route of indexedSeoRoutes) {
    if (!route.canonical) throw new Error(`Indexed route ${route.path} is missing a canonical URL.`);
  }
}

function renderSitemap() {
  const urls = indexedSeoRoutes
    .map((route) => `  <url>\n    <loc>${escapeXml(route.canonical!)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function ensureMainTarget(markup: string) {
  if (!/<main\b/i.test(markup)) throw new Error("Every prerendered route must contain a main landmark.");
  if (/\bid=["']main-content["']/i.test(markup)) {
    return markup.replace(/<main\b([^>]*\bid=["']main-content["'][^>]*)>/i, (tag, attributes: string) =>
      /\btabindex=/i.test(attributes) ? tag : `<main${attributes} tabindex="-1">`
    );
  }
  return markup.replace(/<main\b/i, '<main id="main-content" tabindex="-1"');
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeXml(value: string) {
  return escapeAttribute(value).replace(/'/g, "&apos;");
}

await main();

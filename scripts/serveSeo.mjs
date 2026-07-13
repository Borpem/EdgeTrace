import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST_DIR = resolve(ROOT_DIR, "dist");
const requestedPort = Number.parseInt(valueAfter("--port") ?? process.env.PORT ?? "4178", 10);
const port = Number.isFinite(requestedPort) ? requestedPort : 4178;

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
  { source: "/dashboard/", destination: "/app/dashboard/" },
  { source: "/collections/", destination: "/app/collections/" },
  { source: "/compare/", destination: "/app/compare/" }
];

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"]
]);

if (!existsSync(resolve(DIST_DIR, "index.html"))) {
  process.stderr.write("SEO server requires a production build. Run npm run build first.\n");
  process.exit(1);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  setSecurityHeaders(response);

  if (pathname === "/__seo-health") {
    sendText(response, 200, "ok");
    return;
  }

  const legacyLookupPath = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const redirectTarget = legacyRedirects.get(legacyLookupPath);
  if (redirectTarget) {
    response.statusCode = 301;
    response.setHeader("Location", `${redirectTarget}${url.search}`);
    response.end();
    return;
  }

  const nestedRedirect = legacyNestedRedirects.find(({ source }) => pathname.startsWith(source));
  if (nestedRedirect) {
    const redirectPath = `${nestedRedirect.destination}${pathname.slice(nestedRedirect.source.length)}`;
    const canonicalRedirectPath = redirectPath.endsWith("/") ? redirectPath.slice(0, -1) : redirectPath;
    response.statusCode = 301;
    response.setHeader(
      "Location",
      `${canonicalRedirectPath}${url.search}`
    );
    response.end();
    return;
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    response.statusCode = 308;
    response.setHeader("Location", `${pathname.slice(0, -1)}${url.search}`);
    response.end();
    return;
  }

  if (pathname.endsWith(".html")) {
    response.statusCode = 308;
    response.setHeader("Location", `${pathname.slice(0, -5)}${url.search}`);
    response.end();
    return;
  }

  setRouteHeaders(response, pathname);

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    sendText(response, 502, "API proxy is not available in the static SEO test server.");
    return;
  }

  const resolution = resolveRequest(pathname);
  if (!resolution) {
    response.setHeader("X-Robots-Tag", "noindex");
    serveFile(request, response, resolve(DIST_DIR, "404.html"), 404);
    return;
  }

  serveFile(request, response, resolution.file, resolution.status);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`EdgeTrace SEO server listening on http://127.0.0.1:${port}\n`);
});

function resolveRequest(pathname) {
  if (pathname === "/") return existing("index.html");
  if (pathname === "/404") {
    const result = existing("404.html");
    return result ? { ...result, status: 404 } : null;
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) return existing("shells/app.html");
  if (pathname === "/login" || pathname.startsWith("/login/")) return existing("shells/login.html");
  if (pathname === "/signup" || pathname.startsWith("/signup/")) return existing("shells/signup.html");

  const direct = safeDistPath(pathname.slice(1));
  if (direct && isFile(direct)) return { file: direct, status: 200 };

  if (!extname(pathname)) {
    const cleanHtml = safeDistPath(`${pathname.slice(1)}.html`);
    if (cleanHtml && isFile(cleanHtml)) return { file: cleanHtml, status: 200 };
  }

  return null;
}

function existing(relativePath) {
  const file = safeDistPath(relativePath);
  return file && isFile(file) ? { file, status: 200 } : null;
}

function safeDistPath(relativePath) {
  const file = resolve(DIST_DIR, relativePath);
  return file === DIST_DIR || file.startsWith(`${DIST_DIR}${sep}`) ? file : null;
}

function isFile(file) {
  try {
    return hasExactCase(file) && statSync(file).isFile();
  } catch {
    return false;
  }
}

function hasExactCase(file) {
  const pathFromDist = relative(DIST_DIR, file);
  if (!pathFromDist || pathFromDist.startsWith("..")) return pathFromDist === "";
  let current = DIST_DIR;
  for (const segment of pathFromDist.split(sep)) {
    if (!readdirSync(current).includes(segment)) return false;
    current = resolve(current, segment);
  }
  return true;
}

function serveFile(request, response, file, statusCode) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.setHeader("Content-Length", "0");
    response.end();
    return;
  }
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentTypes.get(extname(file).toLowerCase()) ?? "application/octet-stream");
  response.setHeader("Content-Length", statSync(file).size);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
}

function setRouteHeaders(response, pathname) {
  if (pathname.startsWith("/assets/")) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  if (pathname.startsWith("/brand/") || pathname.startsWith("/graphics/") || pathname.startsWith("/marketing/")) {
    response.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  }
  if (pathname === "/app" || pathname.startsWith("/app/") || pathname === "/api" || pathname.startsWith("/api/")) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    return;
  }
  if (pathname === "/shells" || pathname.startsWith("/shells/")) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    return;
  }
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/404" ||
    pathname === "/brand/atlas-brand-sheet" ||
    pathname === "/brand/edgetrace-brand-sheet" ||
    /^\/sample-.*\.csv$/i.test(pathname)
  ) {
    response.setHeader("X-Robots-Tag", "noindex");
  }
}

function sendText(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(body);
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

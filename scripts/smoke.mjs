import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "public/sample-trades.csv",
  "public/sample-trades-breakdown.csv",
  "public/sample-trades-improved.csv",
  "src/App.tsx",
  "server/index.ts",
  "server/db.ts"
];
const requiredServerRoutes = [
  "/api/diagnostics",
  "/api/collections",
  "/api/saved-comparisons",
  "/api/demo-data"
];
const requiredClientRoutes = [
  "reports",
  "collections",
  "compare",
  "review-workspace"
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`Missing required file: ${file}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of ["build", "test:imports"]) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing npm script: ${script}`);
}

const serverIndex = readFileSync(join(root, "server/index.ts"), "utf8");
for (const route of requiredServerRoutes) {
  if (!serverIndex.includes(route)) failures.push(`Missing expected server route: ${route}`);
}
if (!serverIndex.includes("\"worker-src 'self' blob:\"")) {
  failures.push("Backend CSP must allow first-party blob workers.");
}
if (!serverIndex.includes("https://clerk.edgetrace.app")) {
  failures.push("Backend CSP must allow the production Clerk custom domain.");
}

const vercelConfig = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const vercelCsp = vercelConfig.headers
  ?.flatMap((entry) => entry.headers ?? [])
  ?.find((header) => header.key === "Content-Security-Policy")
  ?.value;
if (!vercelCsp?.includes("worker-src 'self' blob:")) {
  failures.push("Vercel CSP must allow first-party blob workers.");
}
if (!vercelCsp?.includes("https://clerk.edgetrace.app")) {
  failures.push("Vercel CSP must allow the production Clerk custom domain.");
}

const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
for (const route of requiredClientRoutes) {
  if (!appSource.includes(route)) failures.push(`Missing expected client route keyword: ${route}`);
}
if (!appSource.includes("canRenderWhileAuthLoads")) {
  failures.push("Public routes must be able to render while auth bootstrap is loading.");
}

const authContextSource = readFileSync(join(root, "src/context/AuthContext.tsx"), "utf8");
if (!authContextSource.includes("clientStartupError")) {
  failures.push("Missing controlled client startup error for auth misconfiguration.");
}
if (!authContextSource.includes("setLoadTimedOut")) {
  failures.push("Missing Clerk load timeout fallback.");
}

if (failures.length) {
  console.error("Smoke check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Smoke check passed: core files, scripts, routes, and samples are present.");

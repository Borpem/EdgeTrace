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

const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
for (const route of requiredClientRoutes) {
  if (!appSource.includes(route)) failures.push(`Missing expected client route keyword: ${route}`);
}

if (failures.length) {
  console.error("Smoke check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Smoke check passed: core files, scripts, routes, and samples are present.");

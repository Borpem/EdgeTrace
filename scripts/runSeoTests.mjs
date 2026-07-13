import { spawn } from "node:child_process";

const port = 4178;
const server = spawn(process.execPath, ["scripts/serveSeo.mjs", "--port", String(port)], {
  stdio: "inherit",
  shell: false
});

try {
  await Promise.race([
    waitForUrl(`http://127.0.0.1:${port}/__seo-health`),
    new Promise((_, reject) => {
      server.once("error", reject);
      server.once("exit", (code) => {
        reject(new Error(`The SEO test server exited before startup (code ${code ?? 1}).`));
      });
    })
  ]);
  const exitCode = await run(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.seo.config.ts", ...process.argv.slice(2)],
    { PW_SEO_MANAGED_SERVER: "1" }
  );
  process.exitCode = exitCode;
} finally {
  stopServer();
}

function run(command, args, extraEnv) {
  return new Promise((resolveExit) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
      shell: false
    });
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
}

async function waitForUrl(url) {
  const deadline = Date.now() + 30_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`SEO server did not start. Last error: ${lastError}`);
}

function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
}

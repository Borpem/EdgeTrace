import { execFileSync, spawn } from "node:child_process";

const devServer = spawn(process.execPath, ["scripts/dev-e2e.mjs"], {
  stdio: "inherit",
  shell: false
});

try {
  await waitForUrl("http://127.0.0.1:7174/");
  await waitForUrl("http://127.0.0.1:4107/api/diagnostics", { okStatuses: [200] });

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const exitCode = await run(command, ["playwright", "test"], {
    PW_MANAGED_SERVER: "1",
    E2E_API_BASE_URL: "http://127.0.0.1:4107"
  });

  process.exitCode = exitCode;
} finally {
  devServer.kill("SIGTERM");
  cleanupKnownTestPorts();
}

function run(command, args, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForUrl(url, options = {}) {
  const deadline = Date.now() + 120_000;
  const okStatuses = options.okStatuses ?? [200, 404];
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (okStatuses.includes(response.status)) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

function cleanupKnownTestPorts() {
  if (process.platform !== "win32") return;

  try {
    const output = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes(":7174") && !line.includes(":4107")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts.at(-1);
      if (pid && pid !== "0") pids.add(pid);
    }

    for (const pid of pids) {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // The process may already be gone.
      }
    }
  } catch {
    // Cleanup is best-effort only.
  }
}
